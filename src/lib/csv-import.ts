import type { ParsedLeadRow } from "@/lib/csv-parse";
import { importLeadBatch, type NormalizedLeadInput, type ImportSummary } from "@/lib/lead-import";

/**
 * Importación masiva de leads desde CSV.
 *
 * El parseo del archivo vive en `csv-parse.ts` (módulo puro, sin Prisma, para
 * que la vista previa del cliente reuse la misma lógica). La deduplicación,
 * scoring, recomendación e inserción viven en `lead-import.ts`
 * (`importLeadBatch`), compartido con el Lead Hunter y futuras integraciones.
 * Este archivo solo traduce filas de CSV al formato genérico del importador.
 *
 * IMPORTANTE (cumplimiento): estos leads entran SIEMPRE como
 * consentStatus = SIN_CONSENTIMIENTO (lo aplica `importLeadBatch`, no es
 * configurable desde aquí) — WhatsApp queda bloqueado por el guard hasta que
 * exista opt-in trazable por un canal permitido.
 */

export { parseLeadsCsv, CSV_COLUMNS, CSV_TEMPLATE, type ParsedLeadRow, type RowError } from "@/lib/csv-parse";
export type { ImportSummary } from "@/lib/lead-import";

function toNormalized(row: ParsedLeadRow): NormalizedLeadInput {
  return {
    companyName: row.companyName,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    website: row.website,
    city: row.city,
    country: row.country,
    category: row.category,
    address: row.address,
    rating: row.rating,
    reviewsCount: row.reviewsCount,
    instagram: row.instagram,
    facebook: row.facebook,
    googleMapsUrl: row.googleMapsUrl,
    notes: row.notes,
    sourceDetail: row.sourceDetail,
  };
}

/** Importa filas de CSV ya parseadas, vía el importador genérico compartido. */
export async function importLeads(
  rows: ParsedLeadRow[],
  options: { authorId?: string; batchLabel?: string } = {},
): Promise<ImportSummary> {
  return importLeadBatch({
    leads: rows.map(toNormalized),
    source: "CSV_IMPORT",
    batchLabel: options.batchLabel,
    authorId: options.authorId,
  });
}
