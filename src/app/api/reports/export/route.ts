import { leadsCsv } from "@/lib/reports";
import { requireApiSession, handleApiError } from "@/lib/api";

/** Exportación de leads a CSV (abre en Excel). */
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const csv = await leadsCsv();
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
