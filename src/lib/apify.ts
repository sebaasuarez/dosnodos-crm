import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { scoreLead } from "@/lib/scoring";
import { recommendService } from "@/lib/recommendation";
import { searchGoogleMaps, apifyActorId, isApifyConfigured } from "@/lib/lead-hunter/apify-client";
import { mapRawPlaceToNormalizedLead } from "@/lib/lead-hunter/normalize";
import { importLeadBatch } from "@/lib/lead-import";
import type { Prisma } from "@prisma/client";

/**
 * Lead Hunter legado — búsqueda manual puntual (1 ciudad + 1 categoría) desde
 * el formulario `HunterForm` en el dashboard. Reutiliza el mismo cliente HTTP
 * de Apify (`lead-hunter/apify-client.ts`) y el mismo importador compartido
 * (`lead-import.ts`) que usan el CSV y el Lead Hunter automático nuevo — así
 * no hay dos implementaciones distintas de la llamada a Apify ni del
 * dedupe/scoring/creación de leads.
 *
 * Se mantiene como flujo aparte (fuente `APIFY_GOOGLE_MAPS`, propio registro
 * en `ApifyRun`) porque alimenta una pantalla y un historial ya existentes;
 * el Lead Hunter automático (14 búsquedas + IA, fuente `LEAD_HUNTER`) vive en
 * `src/lib/lead-hunter/run.ts` y tiene su propio registro en
 * `LeadHunterExecution`.
 *
 * IMPORTANTE: los leads capturados aquí entran SIEMPRE con
 * consentStatus = SIN_CONSENTIMIENTO. El guard de cumplimiento impide
 * enviarles WhatsApp hasta que exista opt-in trazable.
 */

export type HunterInput = {
  city: string;
  category: string;
  keywords?: string;
  maxResults?: number;
};

// ── Pipeline principal ───────────────────────────────────────────

export async function runLeadHunter(input: HunterInput) {
  const useMock = !isApifyConfigured();
  const run = await db.apifyRun.create({
    data: {
      actorId: useMock ? "mock" : apifyActorId(),
      status: "EN_EJECUCION",
      input: input as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    const searchString = [input.category, input.keywords].filter(Boolean).join(" ");
    const places = await searchGoogleMaps({
      searchString,
      city: input.city,
      country: "Colombia",
      maxResults: input.maxResults ?? 20,
    });

    const minRating = await getSetting("leadHunter.minRating");
    const minReviews = await getSetting("leadHunter.minReviews");

    let filtered = 0;
    const candidates = [];
    for (const place of places) {
      if (!place.title) continue;
      if ((place.totalScore ?? 0) < minRating || (place.reviewsCount ?? 0) < minReviews) {
        filtered++;
        continue;
      }
      candidates.push(
        mapRawPlaceToNormalizedLead(
          place,
          { id: "apify-manual", searchString, category: input.category, city: input.city, country: "Colombia" },
          `run:${run.id}`,
        ),
      );
    }

    const summary = await importLeadBatch({
      leads: candidates,
      source: "APIFY_GOOGLE_MAPS",
      batchLabel: `run:${run.id}`,
    });

    const finished = await db.apifyRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETADO",
        totalResults: places.length,
        newLeads: summary.created,
        duplicates: summary.duplicates,
        finishedAt: new Date(),
      },
    });
    await audit({
      action: "leadhunter.run.completed",
      entity: "apify_run",
      entityId: run.id,
      detail: {
        city: input.city,
        category: input.category,
        total: places.length,
        newLeads: summary.created,
        duplicates: summary.duplicates,
        filtered,
        mock: useMock,
      },
    });
    return finished;
  } catch (err) {
    await db.apifyRun.update({
      where: { id: run.id },
      data: { status: "FALLIDO", error: String(err), finishedAt: new Date() },
    });
    await audit({
      action: "leadhunter.run.failed",
      entity: "apify_run",
      entityId: run.id,
      level: "error",
      detail: { error: String(err) },
    });
    throw err;
  }
}

/** Enriquece un lead: recalcula señales, score y servicio recomendado. */
export async function enrichLead(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const { score, breakdown } = await scoreLead(lead);
  const recommendation = recommendService(lead);

  const opportunities: string[] = [];
  if (!lead.hasWebsite) opportunities.push("Sin sitio web propio");
  if (lead.hasSocialMedia && !lead.hasWebsite) opportunities.push("Depende de redes sociales");
  if (lead.hasWhatsapp && !lead.hasWebsite) opportunities.push("WhatsApp como canal principal");
  if ((lead.reviewsCount ?? 0) > 50 && !lead.hasWebsite)
    opportunities.push("Muchas reseñas pero poca estructura digital");
  if ((lead.rating ?? 0) >= 4.2) opportunities.push("Buena reputación aprovechable con SEO local");

  return db.lead.update({
    where: { id: leadId },
    data: {
      score,
      scoreBreakdown: breakdown,
      recommendedService: recommendation.service,
      recommendedPackage: recommendation.packageName,
      digitalOpportunitySummary: opportunities.join(". ") || "Presencia digital básica cubierta.",
      enrichedAt: new Date(),
      status: lead.status === "NUEVO" ? (score >= 31 ? "CALIFICADO" : "ENRIQUECIDO") : lead.status,
      scoreHistory: { create: { score, breakdown } },
    },
  });
}
