import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScoreSettings, computeScore } from "@/lib/scoring";
import { recommendService } from "@/lib/recommendation";
import { parseLeadsCsv, type ParsedLeadRow, type RowError } from "@/lib/csv-parse";
import type { Prisma } from "@prisma/client";

/**
 * Importación masiva de leads desde CSV.
 *
 * El parseo del archivo y la definición de columnas viven en `csv-parse.ts`
 * (módulo puro, sin Prisma) para que la vista previa del cliente pueda
 * reusar exactamente la misma lógica. Este archivo solo se ocupa de lo que
 * requiere base de datos: deduplicación, scoring e inserción.
 *
 * IMPORTANTE (cumplimiento): estos leads entran SIEMPRE como
 * consentStatus = SIN_CONSENTIMIENTO — igual que los del Lead Hunter. WhatsApp
 * queda bloqueado por el guard hasta que exista opt-in trazable por un canal
 * permitido. Este módulo NO acepta un consentStatus por fila: es una decisión
 * de producto, no de datos, para evitar que un CSV mal marcado salte el guard.
 *
 * Rendimiento: para evitar el problema de timeout ya visto con Apify en
 * Vercel (funciones serverless con límite de tiempo), este módulo evita
 * N+1 queries — carga settings de scoring UNA vez, hace UNA query de
 * deduplicación en lote, y usa createMany para insertar en bloques.
 */

export { parseLeadsCsv, CSV_COLUMNS, CSV_TEMPLATE, type ParsedLeadRow, type RowError } from "@/lib/csv-parse";

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

/**
 * Importa leads ya parseados: deduplica en lote, calcula score y
 * recomendación en memoria (sin N+1 queries) e inserta en bloques.
 */
export async function importLeads(
  rows: ParsedLeadRow[],
  options: { authorId?: string; batchLabel?: string } = {},
): Promise<ImportSummary> {
  if (rows.length === 0) {
    return { totalRows: 0, created: 0, duplicates: 0, invalid: 0, errors: [] };
  }

  const scoreSettings = await loadScoreSettings();

  // Deduplicación en lote: una sola query trae todos los leads existentes
  // que puedan chocar con el archivo (por teléfono, email o nombre+ciudad).
  const phones = rows.map((r) => r.phone).filter((v): v is string => Boolean(v));
  const emails = rows.map((r) => r.email).filter((v): v is string => Boolean(v));
  const companyNames = [...new Set(rows.map((r) => r.companyName))];

  const existing = await db.lead.findMany({
    where: {
      OR: [
        phones.length ? { phone: { in: phones } } : undefined,
        emails.length ? { email: { in: emails } } : undefined,
        { companyName: { in: companyNames } },
      ].filter(Boolean) as Prisma.LeadWhereInput[],
    },
    select: { phone: true, email: true, companyName: true, city: true },
  });
  const existingPhones = new Set(existing.map((l) => l.phone).filter(Boolean));
  const existingEmails = new Set(existing.map((l) => l.email).filter(Boolean));
  const existingCompanyCity = new Set(
    existing.map((l) => `${l.companyName.toLowerCase()}|${(l.city ?? "").toLowerCase()}`),
  );

  const seenInBatch = new Set<string>(); // detecta duplicados dentro del mismo archivo
  const leadsData: Prisma.LeadCreateManyInput[] = [];
  const scoreHistoryData: Prisma.LeadScoreCreateManyInput[] = [];
  const noteData: Prisma.NoteCreateManyInput[] = [];
  let duplicates = 0;

  for (const row of rows) {
    const companyCityKey = `${row.companyName.toLowerCase()}|${(row.city ?? "").toLowerCase()}`;
    const batchKey = row.phone ?? row.email ?? companyCityKey;
    const isDuplicate =
      (row.phone && existingPhones.has(row.phone)) ||
      (row.email && existingEmails.has(row.email)) ||
      existingCompanyCity.has(companyCityKey) ||
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
      rating: row.rating,
      reviewsCount: row.reviewsCount,
      socialMedia: Object.keys(socialMedia).length ? socialMedia : undefined,
      hasWebsite: scorable.hasWebsite,
      hasWhatsapp: scorable.hasWhatsapp,
      hasEmail: scorable.hasEmail,
      hasSocialMedia: scorable.hasSocialMedia,
      source: "CSV_IMPORT",
      sourceDetail: row.sourceDetail ?? options.batchLabel,
      status: score >= 31 ? "CALIFICADO" : "ENRIQUECIDO",
      consentStatus: "SIN_CONSENTIMIENTO",
      score,
      scoreBreakdown: breakdown,
      recommendedService: recommendation.service,
      recommendedPackage: recommendation.packageName,
      digitalOpportunitySummary: opportunities.join(". ") || "Presencia digital básica cubierta.",
      enrichedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    scoreHistoryData.push({ leadId: id, score, breakdown, createdAt: now });
    if (row.notes) {
      noteData.push({ leadId: id, content: row.notes, authorId: options.authorId, createdAt: now });
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
    action: "leads.csv_import",
    userId: options.authorId,
    detail: {
      totalRows: rows.length,
      created: leadsData.length,
      duplicates,
      batchLabel: options.batchLabel,
    },
  });

  return {
    totalRows: rows.length,
    created: leadsData.length,
    duplicates,
    invalid: 0,
    errors: [],
  };
}
