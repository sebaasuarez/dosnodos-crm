import { requireApiSession, handleApiError, jsonError } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Respaldo en CSV de los leads producidos por una ejecución puntual del
 * Lead Hunter — el flujo principal trabaja con objetos/BD, no con CSV; esto
 * es solo una exportación de respaldo/auditoría bajo demanda, con las
 * columnas exactas pedidas en la especificación.
 */
const CSV_COLUMNS = [
  "nombre_negocio",
  "nombre_contacto",
  "telefono",
  "email",
  "sitio_web",
  "ciudad",
  "pais",
  "categoria",
  "direccion",
  "rating",
  "resenas",
  "instagram",
  "facebook",
  "google_maps_url",
  "notas",
  "fuente_detalle",
] as const;

function escapeCsv(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const execution = await db.leadHunterExecution.findUnique({ where: { id } });
    if (!execution) return jsonError("Ejecución no encontrada", 404);

    const leads = await db.lead.findMany({
      where: { leadHunterExecutionId: id },
      include: { notes: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });

    const rows = leads.map((lead) => {
      const socialMedia = (lead.socialMedia as { instagram?: string; facebook?: string } | null) ?? {};
      const notas = lead.notes.map((n) => n.content).join(" | ");
      return [
        lead.companyName,
        lead.contactName ?? "",
        lead.phone ?? "",
        lead.email ?? "",
        lead.website ?? "",
        lead.city ?? "",
        lead.country,
        lead.category ?? "",
        lead.address ?? "",
        lead.rating ?? "",
        lead.reviewsCount ?? "",
        socialMedia.instagram ?? "",
        socialMedia.facebook ?? "",
        lead.googleMapsUrl ?? "",
        notas,
        lead.sourceDetail ?? "",
      ]
        .map(escapeCsv)
        .join(",");
    });

    const csv = [CSV_COLUMNS.join(","), ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${execution.batchLabel}-${id}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
