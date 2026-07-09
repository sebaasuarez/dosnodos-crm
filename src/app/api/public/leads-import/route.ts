import { NextResponse } from "next/server";
import { parseLeadsCsv, importLeads } from "@/lib/csv-import";
import { handleApiError, jsonError } from "@/lib/api";
import { audit } from "@/lib/audit";

// Ver docs/CSV_IMPORT.md para el formato exacto de columnas esperado.
export const maxDuration = 60;

/**
 * Endpoint público para importar leads desde una automatización externa
 * (ej. un flujo de ChatGPT/Zapier/Make que genera un CSV de prospectos).
 *
 * Protegido con CSV_IMPORT_TOKEN en el header `x-import-token` (no requiere
 * sesión de usuario — pensado para llamadas servidor-a-servidor).
 *
 * Body: JSON { csv: string, batchLabel?: string }
 *   o   texto plano CSV directo con Content-Type: text/csv
 *
 * Los leads entran SIEMPRE sin consentimiento de WhatsApp (ver csv-import.ts).
 */
export async function POST(request: Request) {
  const token = process.env.CSV_IMPORT_TOKEN;
  const header = request.headers.get("x-import-token");
  if (!token || header !== token) {
    await audit({ action: "leads.csv_import.rejected", level: "warn" });
    return jsonError("Token inválido", 401);
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let csvText: string;
    let batchLabel: string | undefined;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (typeof body.csv !== "string") return jsonError("Falta el campo 'csv' (texto)", 422);
      csvText = body.csv;
      batchLabel = body.batchLabel;
    } else {
      csvText = await request.text();
      batchLabel = request.headers.get("x-batch-label") ?? undefined;
    }

    const { rows, errors: parseErrors } = parseLeadsCsv(csvText);
    if (rows.length === 0) {
      return jsonError(parseErrors[0]?.reason ?? "El CSV no tiene filas válidas para importar", 422);
    }

    const result = await importLeads(rows, { batchLabel: batchLabel ?? "automatización externa" });
    return NextResponse.json({ ...result, errors: [...parseErrors, ...result.errors] }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
