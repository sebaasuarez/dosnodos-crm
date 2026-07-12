import { NextResponse } from "next/server";
import { requireCronSecret, handleApiError } from "@/lib/api";
import { runLeadHunter } from "@/lib/lead-hunter/run";

/**
 * Disparador diario del Lead Hunter — invocado por Vercel Cron (ver
 * vercel.json, 13:00 UTC = 8:00 a.m. Colombia). Protegido con CRON_SECRET
 * (misma convención que /api/jobs/[job]: header `Authorization: Bearer` o
 * `x-cron-secret`).
 *
 * NUNCA se llama desde el navegador — el botón "Ejecutar ahora" del
 * dashboard usa /api/admin/lead-hunter/run, un endpoint autenticado
 * separado, no este.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const outcome = await runLeadHunter("CRON");

    if (outcome.alreadyRunning) {
      return NextResponse.json({
        success: true,
        executionId: outcome.executionId,
        alreadyRunning: true,
        startedAt: outcome.startedAt,
        finishedAt: outcome.finishedAt,
      });
    }

    return NextResponse.json({
      success: true,
      executionId: outcome.executionId,
      queriesExecuted: outcome.queriesExecuted,
      rawResults: outcome.rawResults,
      validResults: outcome.validResults,
      created: outcome.created,
      duplicates: outcome.duplicates,
      invalid: outcome.invalid,
      failed: outcome.failed,
      startedAt: outcome.startedAt,
      finishedAt: outcome.finishedAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
