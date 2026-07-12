import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { importLeadBatch, type NormalizedLeadInput } from "@/lib/lead-import";
import { getLeadHunterQueries } from "./queries";
import { searchGoogleMaps } from "./apify-client";
import { mapRawPlaceToNormalizedLead, hasUsableContact } from "./normalize";
import { enrichLeadWithAI, aiEnrichmentEnabled } from "./ai-enrichment";
import { sendLeadHunterSummaryEmail } from "./notify";
import type { Prisma, LeadHunterExecutionStatus, LeadHunterTriggerType } from "@prisma/client";

/**
 * Orquestador del Lead Hunter: corre las búsquedas configuradas (Apify),
 * normaliza y filtra resultados, enriquece con IA y guarda vía el
 * importador compartido (`importLeadBatch`) — el mismo camino que usa el
 * importador de CSV, para no duplicar validación/dedup/scoring.
 *
 * Candado de concurrencia: antes de arrancar, cualquier ejecución `RUNNING`
 * más vieja que `STALE_RUNNING_MS` se marca `FAILED` automáticamente (nunca
 * debe quedar una ejecución colgada para siempre, p.ej. si la función
 * serverless murió por timeout de plataforma sin poder correr su propio
 * `catch`). Si tras eso sigue habiendo una ejecución `RUNNING` genuina, no se
 * arranca una nueva — se devuelve el estado de la que ya corre.
 */

const STALE_RUNNING_MS = 10 * 60 * 1000;

const SECRET_ENV_VARS = ["APIFY_TOKEN", "OPENAI_API_KEY", "CRON_SECRET"] as const;

/** Redacta cualquier valor de secreto conocido antes de loguear/persistir un error. */
function safeErrorMessage(err: unknown): string {
  let text = err instanceof Error ? err.message : String(err);
  for (const key of SECRET_ENV_VARS) {
    const value = process.env[key];
    if (value) text = text.split(value).join("[REDACTED]");
  }
  return text.slice(0, 500);
}

/** Expuesta para que el dashboard calcule "hoy" con el mismo criterio que el cron. */
export function buildBatchLabel(): string {
  const timeZone = process.env.LEAD_HUNTER_TIMEZONE || "America/Bogota";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `lead-hunter-${map.year}-${map.month}-${map.day}`;
}

/** Cualquier RUNNING más vieja que el umbral es un huérfano — nunca debe bloquear para siempre. */
async function reclaimStaleRunning(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MS);
  await db.leadHunterExecution.updateMany({
    where: { status: "RUNNING", startedAt: { lt: staleThreshold } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorSummary:
        "Marcada como fallida automáticamente: superó el tiempo máximo esperado sin finalizar.",
    },
  });
}

export type LeadHunterRunOutcome = {
  executionId: string;
  alreadyRunning: boolean;
  status: LeadHunterExecutionStatus;
  triggerType: LeadHunterTriggerType;
  queriesExecuted: number;
  rawResults: number;
  validResults: number;
  created: number;
  duplicates: number;
  invalid: number;
  failed: number;
  startedAt: string;
  finishedAt: string | null;
};

type FinalizeData = {
  status: Exclude<LeadHunterExecutionStatus, "RUNNING">;
  queriesExecuted: number;
  rawResults: number;
  validResults: number;
  created: number;
  duplicates: number;
  invalid: number;
  failed: number;
  errorSummary: string | null;
  metadata: Record<string, unknown>;
};

async function finalize(executionId: string, data: FinalizeData): Promise<LeadHunterRunOutcome> {
  const finishedAt = new Date();
  const updated = await db.leadHunterExecution.update({
    where: { id: executionId },
    data: {
      status: data.status,
      finishedAt,
      queriesExecuted: data.queriesExecuted,
      rawResults: data.rawResults,
      validResults: data.validResults,
      created: data.created,
      duplicates: data.duplicates,
      invalid: data.invalid,
      failed: data.failed,
      errorSummary: data.errorSummary,
      metadata: data.metadata as Prisma.InputJsonValue,
    },
  });
  await audit({
    action: `lead_hunter.execution.${data.status.toLowerCase()}`,
    entity: "lead_hunter_execution",
    entityId: executionId,
    level: data.status === "FAILED" ? "error" : "info",
    detail: {
      triggerType: updated.triggerType,
      queriesExecuted: data.queriesExecuted,
      rawResults: data.rawResults,
      validResults: data.validResults,
      created: data.created,
      duplicates: data.duplicates,
      invalid: data.invalid,
      failed: data.failed,
    },
  });
  const outcome: LeadHunterRunOutcome = {
    executionId: updated.id,
    alreadyRunning: false,
    status: updated.status,
    triggerType: updated.triggerType,
    queriesExecuted: updated.queriesExecuted,
    rawResults: updated.rawResults,
    validResults: updated.validResults,
    created: updated.created,
    duplicates: updated.duplicates,
    invalid: updated.invalid,
    failed: updated.failed,
    startedAt: updated.startedAt.toISOString(),
    finishedAt: updated.finishedAt ? updated.finishedAt.toISOString() : null,
  };

  await sendLeadHunterSummaryEmail(outcome);

  return outcome;
}

/**
 * Corre el Lead Hunter de punta a punta. `triggerType` distingue si vino del
 * cron diario o del botón "Ejecutar ahora" del dashboard — ambos comparten
 * exactamente el mismo candado de concurrencia y el mismo pipeline.
 */
export async function runLeadHunter(triggerType: "CRON" | "MANUAL"): Promise<LeadHunterRunOutcome> {
  await reclaimStaleRunning();

  const active = await db.leadHunterExecution.findFirst({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
  if (active) {
    return {
      executionId: active.id,
      alreadyRunning: true,
      status: active.status,
      triggerType: active.triggerType,
      queriesExecuted: active.queriesExecuted,
      rawResults: active.rawResults,
      validResults: active.validResults,
      created: active.created,
      duplicates: active.duplicates,
      invalid: active.invalid,
      failed: active.failed,
      startedAt: active.startedAt.toISOString(),
      finishedAt: null,
    };
  }

  const batchLabel = buildBatchLabel();
  const execution = await db.leadHunterExecution.create({
    data: { triggerType, batchLabel, status: "RUNNING" },
  });

  const enabled = process.env.LEAD_HUNTER_ENABLED !== "false";
  if (!enabled) {
    return finalize(execution.id, {
      status: "SUCCESS",
      queriesExecuted: 0,
      rawResults: 0,
      validResults: 0,
      created: 0,
      duplicates: 0,
      invalid: 0,
      failed: 0,
      errorSummary: null,
      metadata: { skipped: true, reason: "LEAD_HUNTER_ENABLED=false" },
    });
  }

  try {
    const queries = getLeadHunterQueries();
    const dailyLimit = Number(process.env.LEAD_HUNTER_DAILY_LIMIT) || 20;
    const alreadyCreatedToday = await db.lead.count({
      where: { source: "LEAD_HUNTER", sourceDetail: batchLabel },
    });
    const remainingSlots = Math.max(0, dailyLimit - alreadyCreatedToday);

    const settled = await Promise.allSettled(
      queries.map((query) =>
        searchGoogleMaps({
          searchString: query.searchString,
          city: query.city,
          country: query.country,
          maxResults: query.maxResults,
        }),
      ),
    );

    let rawResults = 0;
    let validResults = 0;
    let invalid = 0;
    let failed = 0;
    const queryErrors: { queryId: string; error: string }[] = [];
    const candidates: NormalizedLeadInput[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const query = queries[i];
      if (result.status === "rejected") {
        failed++;
        queryErrors.push({ queryId: query.id, error: safeErrorMessage(result.reason) });
        continue;
      }

      for (const place of result.value) {
        rawResults++;
        try {
          const normalized = mapRawPlaceToNormalizedLead(place, query, batchLabel);
          if (!hasUsableContact(normalized)) {
            invalid++;
            continue;
          }
          validResults++;

          let aiObservations: string | undefined;
          const notesLines: string[] = [];
          if (aiEnrichmentEnabled()) {
            const ai = await enrichLeadWithAI({
              companyName: normalized.companyName,
              category: normalized.category,
              city: normalized.city,
              rating: normalized.rating,
              reviewsCount: normalized.reviewsCount,
              hasWebsite: Boolean(normalized.website),
              hasSocialMedia: Boolean(normalized.instagram || normalized.facebook),
            });
            if (ai) {
              aiObservations = ai.opportunityReason;
              notesLines.push(`Mensaje sugerido por IA (revisar antes de enviar, nunca se envía solo): "${ai.outreachMessage}"`);
              notesLines.push(`Servicio sugerido por IA: ${ai.recommendedOffer}`);
              notesLines.push(`Categoría según IA: ${ai.normalizedCategory}`);
            }
          }

          candidates.push({
            ...normalized,
            aiObservations,
            notes: notesLines.length ? notesLines.join("\n") : undefined,
          });
        } catch (err) {
          failed++;
          console.error("[lead-hunter] error procesando un resultado individual:", safeErrorMessage(err));
        }
      }
    }

    const limitedCandidates = candidates.slice(0, remainingSlots);
    const skippedByDailyLimit = candidates.length - limitedCandidates.length;

    const summary = await importLeadBatch({
      leads: limitedCandidates,
      source: "LEAD_HUNTER",
      batchLabel,
      executionId: execution.id,
    });

    const status: "SUCCESS" | "PARTIAL" = failed > 0 || queryErrors.length > 0 ? "PARTIAL" : "SUCCESS";

    return finalize(execution.id, {
      status,
      queriesExecuted: queries.length,
      rawResults,
      validResults,
      created: summary.created,
      duplicates: summary.duplicates,
      invalid,
      failed,
      errorSummary: queryErrors.length
        ? queryErrors.map((e) => `${e.queryId}: ${e.error}`).join(" | ").slice(0, 2000)
        : null,
      metadata: { queryErrors, dailyLimit, alreadyCreatedToday, skippedByDailyLimit },
    });
  } catch (err) {
    return finalize(execution.id, {
      status: "FAILED",
      queriesExecuted: 0,
      rawResults: 0,
      validResults: 0,
      created: 0,
      duplicates: 0,
      invalid: 0,
      failed: 0,
      errorSummary: safeErrorMessage(err),
      metadata: { fatalError: true },
    });
  }
}
