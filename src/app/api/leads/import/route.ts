import { NextResponse } from "next/server";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";
import { parseLeadsCsv, importLeads } from "@/lib/csv-import";

// El parseo + dedupe en lote es rápido, pero un CSV grande (miles de filas)
// puede acercarse al límite por defecto de Vercel. 60s es el máximo en Hobby.
export const maxDuration = 60;

/**
 * Importación de CSV desde el dashboard (autenticada).
 * Acepta multipart/form-data con campo `file`, o JSON { csv: string }.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL", "MARKETING"]);
  if (!auth.ok) return auth.response;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let csvText: string;
    let batchLabel: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("Falta el archivo CSV (campo 'file')", 422);
      csvText = await file.text();
      batchLabel = (form.get("batchLabel") as string) || file.name;
    } else {
      const body = await request.json();
      if (typeof body.csv !== "string") return jsonError("Falta el campo 'csv' (texto)", 422);
      csvText = body.csv;
      batchLabel = body.batchLabel;
    }

    const { rows, errors: parseErrors } = parseLeadsCsv(csvText);
    if (rows.length === 0) {
      return jsonError(
        parseErrors[0]?.reason ?? "El CSV no tiene filas válidas para importar",
        422,
      );
    }

    const result = await importLeads(rows, { authorId: auth.user.id, batchLabel });
    return NextResponse.json({ ...result, errors: [...parseErrors, ...result.errors] }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
