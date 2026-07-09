import { requireApiSession, handleApiError } from "@/lib/api";
import { CSV_TEMPLATE } from "@/lib/csv-import";

/** Descarga la plantilla CSV de ejemplo con el formato exacto esperado. */
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    return new Response(CSV_TEMPLATE, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="plantilla-leads-dosnodos.csv"',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
