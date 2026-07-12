import { NextResponse } from "next/server";
import { requireApiSession, handleApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { runLeadHunter } from "@/lib/lead-hunter/run";

/**
 * Ejecución manual del Lead Hunter desde el botón "Ejecutar ahora" del
 * dashboard. Requiere sesión + rol ADMIN — el cron real
 * (/api/cron/lead-hunter) nunca se llama directamente desde el navegador,
 * y este endpoint jamás recibe ni expone CRON_SECRET/APIFY_TOKEN/OPENAI_API_KEY.
 *
 * Rate limiting: no permite disparar una nueva corrida si la última
 * (cualquiera sea su origen o estado) empezó hace menos de RATE_LIMIT_MS —
 * evita que alguien haga clic repetido y agote presupuesto de Apify/OpenAI.
 * Se apoya en la tabla `LeadHunterExecution` (ya usada como candado de
 * concurrencia) en vez de un limitador en memoria, que no sería confiable
 * entre instancias serverless distintas.
 */
export const maxDuration = 60;

const RATE_LIMIT_MS = 60_000;

export async function POST() {
  const auth = await requireApiSession(["ADMIN"]);
  if (!auth.ok) return auth.response;

  try {
    const recent = await db.leadHunterExecution.findFirst({ orderBy: { startedAt: "desc" } });
    if (recent) {
      const elapsedMs = Date.now() - recent.startedAt.getTime();
      if (elapsedMs < RATE_LIMIT_MS) {
        const waitSeconds = Math.ceil((RATE_LIMIT_MS - elapsedMs) / 1000);
        return NextResponse.json(
          { error: `Espera ${waitSeconds}s antes de ejecutar de nuevo el Lead Hunter.` },
          { status: 429 },
        );
      }
    }

    const outcome = await runLeadHunter("MANUAL");
    return NextResponse.json(outcome);
  } catch (err) {
    return handleApiError(err);
  }
}
