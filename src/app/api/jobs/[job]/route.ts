import { NextResponse } from "next/server";
import { requireCronSecret, handleApiError, jsonError } from "@/lib/api";
import { runJob, JOB_NAMES, type JobName } from "@/lib/jobs";

/**
 * Ejecución de jobs programados.
 * Protegido con CRON_SECRET (header `x-cron-secret` o `Authorization: Bearer`).
 * Compatible con Vercel Cron, GitHub Actions, cron-job.org o crontab.
 */
async function handle(request: Request, params: Promise<{ job: string }>) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const { job } = await params;
    if (!JOB_NAMES.includes(job as JobName)) {
      return jsonError(`Job desconocido. Disponibles: ${JOB_NAMES.join(", ")}`, 404);
    }
    const result = await runJob(job as JobName);
    return NextResponse.json({ job, result });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, params);
}

/** Vercel Cron invoca los jobs con GET + Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, params);
}
