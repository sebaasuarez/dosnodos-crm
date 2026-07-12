import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScoreSettings, computeScore } from "@/lib/scoring";
import { recommendService } from "@/lib/recommendation";
import type { Prisma, LeadSourceType } from "@prisma/client";

/**
 * Importador genérico de leads en lote — el único punto de entrada para
 * crear leads desde cualquier fuente masiva (CSV, Lead Hunter, futuras
 * integraciones). Centraliza: validación de forma mínima, deduplicación,
 * scoring, recomendación, creación del lead, notas y resumen de resultados.
 *
 * Usado por:
 *  - src/lib/csv-import.ts       (importación manual/automatizada de CSV)
 *  - src/lib/lead-hunter/run.ts  (Lead Hunter — Apify + IA)
 *
 * IMPORTANTE (cumplimiento): todo lead importado por este camino entra
 * SIEMPRE con consentStatus = SIN_CONSENTIMIENTO. No es parametrizable —
 * es una decisión de producto para que ninguna fuente masiva pueda saltarse
 * el guard de opt-in de WhatsApp (ver src/lib/compliance.ts).
 *
 * Rendimiento: una sola query de settings de scoring, una sola query de
 * deduplicación en lote (por teléfono, email, negocio+ciudad, URL/place id
 * de Google Maps), e inserción con createMany en bloques — evita el problema
 * de N+1 queries que causó el timeout de Vercel visto con el Apify legado.
 */

export type NormalizedLeadInput = {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  website?: string;
  city?: string;
  country?: string;
  category?: string;
  address?: string;
  rating?: number;
  reviewsCount?: number;
  instagram?: string;
  facebook?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  /** Se guarda como Note interna del lead (visible en su timeline). */
  notes?: string;
  /**
   * Texto libre para el campo `aiObservations` del lead — pensado para el
   * razonamiento de oportunidad de la IA del Lead Hunter. Si no viene, se
   * deja vacío (el CSV, por ejemplo, no lo usa).
   */
  aiObservations?: string;
  sourceDetail?: string;
};

export type RowError = { rowNumber: number; reason: string };

export type ImportSummary = {
  totalRows: number;
  created: number;
  duplicates: number;
  invalid: number;
  errors: RowError[];
};

function randomId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const CHUNK_SIZE = 500;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type ImportLeadBatchOptions = {
  leads: NormalizedLeadInput[];
  source: LeadSourceType;
  batchLabel?: string;
  /** FK opcional a LeadHunterExecution (Fase 4). Se guarda tal cual llega. */
  executionId?: string;
  authorId?: string;
};

/**
 * Importa un lote de leads ya normalizados: deduplica en lote, calcula score
 * y recomendación en memoria (sin N+1 queries) e inserta en bloques.
 */
export async function importLeadBatch({
  leads,
  source,
  batchLabel,
  executionId,
  authorId,
}: ImportLeadBatchOptions): Promise<ImportSummary> {
  if (leads.length === 0) {
    return { totalRows: 0, created: 0, duplicates: 0, invalid: 0, errors: [] };
  }

  const scoreSettings = await loadScoreSettings();

  // Deduplicación en lote: una sola query trae todos los leads existentes
  // que puedan chocar con el lote (por teléfono, email, negocio+ciudad, o
  // identificador de Google Maps).
  const phones = leads.map((r) => r.phone).filter((v): v is string => Boolean(v));
  const emails = leads.map((r) => r.email).filter((v): v is string => Boolean(v));
  const companyNames = [...new Set(leads.map((r) => r.companyName))];
  const mapsUrls = leads.map((r) => r.googleMapsUrl).filter((v): v is string => Boolean(v));
  const placeIds = leads.map((r) => r.googlePlaceId).filter((v): v is string => Boolean(v));

  const existing = await db.lead.findMany({
    where: {
      OR: [
        phones.length ? { phone: { in: phones } } : undefined,
        emails.length ? { email: { in: emails } } : undefined,
        { companyName: { in: companyNames } },
        mapsUrls.length ? { googleMapsUrl: { in: mapsUrls } } : undefined,
        placeIds.length ? { googlePlaceId: { in: placeIds } } : undefined,
      ].filter(Boolean) as Prisma.LeadWhereInput[],
    },
    select: { phone: true, email: true, companyName: true, city: true, googleMapsUrl: true, googlePlaceId: true },
  });
  const existingPhones = new Set(existing.map((l) => l.phone).filter(Boolean));
  const existingEmails = new Set(existing.map((l) => l.email).filter(Boolean));
  const existingCompanyCity = new Set(
    existing.map((l) => `${l.companyName.toLowerCase()}|${(l.city ?? "").toLowerCase()}`),
  );
  const existingMapsUrls = new Set(existing.map((l) => l.googleMapsUrl).filter(Boolean));
  const existingPlaceIds = new Set(existing.map((l) => l.googlePlaceId).filter(Boolean));

  const seenInBatch = new Set<string>(); // detecta duplicados dentro del mismo lote
  const leadsData: Prisma.LeadCreateManyInput[] = [];
  const scoreHistoryData: Prisma.LeadScoreCreateManyInput[] = [];
  const noteData: Prisma.NoteCreateManyInput[] = [];
  let duplicates = 0;

  for (const row of leads) {
    const companyCityKey = `${row.companyName.toLowerCase()}|${(row.city ?? "").toLowerCase()}`;
    const batchKey = row.googleMapsUrl ?? row.googlePlaceId ?? row.phone ?? row.email ?? companyCityKey;
    const isDuplicate =
      (row.phone && existingPhones.has(row.phone)) ||
      (row.email && existingEmails.has(row.email)) ||
      existingCompanyCity.has(companyCityKey) ||
      (row.googleMapsUrl && existingMapsUrls.has(row.googleMapsUrl)) ||
      (row.googlePlaceId && existingPlaceIds.has(row.googlePlaceId)) ||
      seenInBatch.has(batchKey);

    if (isDuplicate) {
      duplicates++;
      continue;
    }
    seenInBatch.add(batchKey);

    const socialMedia: Record<string, string> = {};
    if (row.instagram) socialMedia.instagram = row.instagram;
    if (row.facebook) socialMedia.facebook = row.facebook;

    const scorable = {
      hasWebsite: Boolean(row.website),
      hasWhatsapp: Boolean(row.phone),
      hasEmail: Boolean(row.email),
      hasSocialMedia: Object.keys(socialMedia).length > 0,
      phone: row.phone ?? null,
      email: row.email ?? null,
      website: row.website ?? null,
      category: row.category ?? null,
      rating: row.rating ?? null,
      reviewsCount: row.reviewsCount ?? null,
    };
    const { score, breakdown } = computeScore(scorable, scoreSettings);
    const recommendation = recommendService({
      hasWebsite: scorable.hasWebsite,
      hasSocialMedia: scorable.hasSocialMedia,
      hasWhatsapp: scorable.hasWhatsapp,
      website: row.website ?? null,
      category: row.category ?? null,
      googleMapsUrl: row.googleMapsUrl ?? null,
      reviewsCount: row.reviewsCount ?? null,
    });

    const opportunities: string[] = [];
    if (!scorable.hasWebsite) opportunities.push("Sin sitio web propio");
    if (scorable.hasSocialMedia && !scorable.hasWebsite) opportunities.push("Depende de redes sociales");
    if ((row.reviewsCount ?? 0) > 50 && !scorable.hasWebsite) opportunities.push("Muchas reseñas pero poca estructura digital");

    const id = randomId("lead_");
    const now = new Date();

    leadsData.push({
      id,
      companyName: row.companyName,
      contactName: row.contactName,
      phone: row.phone,
      email: row.email,
      website: row.website,
      address: row.address,
      city: row.city,
      country: row.country ?? "Colombia",
      category: row.category,
      googleMapsUrl: row.googleMapsUrl,
      googlePlaceId: row.googlePlaceId,
      leadHunterExecutionId: executionId,
      rating: row.rating,
      reviewsCount: row.reviewsCount,
      socialMedia: Object.keys(socialMedia).length ? socialMedia : undefined,
      hasWebsite: scorable.hasWebsite,
      hasWhatsapp: scorable.hasWhatsapp,
      hasEmail: scorable.hasEmail,
      hasSocialMedia: scorable.hasSocialMedia,
      source,
      sourceDetail: row.sourceDetail ?? batchLabel,
      status: score >= 31 ? "CALIFICADO" : "ENRIQUECIDO",
      consentStatus: "SIN_CONSENTIMIENTO",
      score,
      scoreBreakdown: breakdown,
      recommendedService: recommendation.service,
      recommendedPackage: recommendation.packageName,
      digitalOpportunitySummary: opportunities.join(". ") || "Presencia digital básica cubierta.",
      aiObservations: row.aiObservations,
      enrichedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    scoreHistoryData.push({ leadId: id, score, breakdown, createdAt: now });
    if (row.notes) {
      noteData.push({ leadId: id, content: row.notes, authorId, createdAt: now });
    }
  }

  for (const batch of chunk(leadsData, CHUNK_SIZE)) {
    await db.lead.createMany({ data: batch });
  }
  for (const batch of chunk(scoreHistoryData, CHUNK_SIZE)) {
    await db.leadScore.createMany({ data: batch });
  }
  for (const batch of chunk(noteData, CHUNK_SIZE)) {
    await db.note.createMany({ data: batch });
  }

  await audit({
    action: `leads.batch_import.${source.toLowerCase()}`,
    userId: authorId,
    detail: {
      source,
      totalRows: leads.length,
      created: leadsData.length,
      duplicates,
      batchLabel,
      executionId,
    },
  });

  return {
    totalRows: leads.length,
    created: leadsData.length,
    duplicates,
    invalid: 0,
    errors: [],
  };
}
