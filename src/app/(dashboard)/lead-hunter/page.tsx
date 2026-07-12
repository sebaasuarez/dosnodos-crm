import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { HunterForm, LeadHunterRunButton } from "@/components/forms";
import { formatDateTime } from "@/lib/format";
import { buildBatchLabel } from "@/lib/lead-hunter/run";
import type { LeadHunterExecutionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_STATUSES: LeadHunterExecutionStatus[] = ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"];

function nextCronRun(): Date {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

const STATUS_BADGE: Record<LeadHunterExecutionStatus, string> = {
  RUNNING: "bg-amber-100 text-amber-800",
  SUCCESS: "bg-emerald-100 text-emerald-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
};

export default async function LeadHunterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const statusFilter =
    params.status && VALID_STATUSES.includes(params.status as LeadHunterExecutionStatus)
      ? (params.status as LeadHunterExecutionStatus)
      : undefined;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const todayBatchLabel = buildBatchLabel();

  const [
    cities,
    categories,
    legacyRuns,
    lastExecution,
    todayAgg,
    last7Agg,
    last30Agg,
    executions,
  ] = await Promise.all([
    getSetting("leadHunter.cities"),
    getSetting("leadHunter.categories"),
    db.apifyRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    db.leadHunterExecution.findFirst({ orderBy: { startedAt: "desc" } }),
    db.leadHunterExecution.aggregate({
      where: { batchLabel: todayBatchLabel },
      _sum: { created: true, duplicates: true, invalid: true, failed: true, rawResults: true },
    }),
    db.leadHunterExecution.aggregate({
      where: { startedAt: { gte: sevenDaysAgo } },
      _sum: { created: true, duplicates: true, invalid: true, failed: true },
    }),
    db.leadHunterExecution.aggregate({
      where: { startedAt: { gte: thirtyDaysAgo } },
      _sum: { created: true, duplicates: true, invalid: true, failed: true },
    }),
    db.leadHunterExecution.findMany({
      where: {
        status: statusFilter,
        startedAt: {
          gte: params.from ? new Date(params.from) : undefined,
          lte: params.to ? new Date(params.to) : undefined,
        },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    }),
  ]);

  const enabled = process.env.LEAD_HUNTER_ENABLED !== "false";
  const apifyConfigured = Boolean(process.env.APIFY_TOKEN);
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Lead Hunter</h1>
        <p className="text-sm text-slate-500">
          Búsqueda y captura diaria de prospectos desde Google Maps (Apify) + enriquecimiento con IA.
          Los leads entran <strong>sin consentimiento de WhatsApp</strong> y pasan por scoring y
          captación de opt-in antes de cualquier contacto.
        </p>
      </header>

      <section className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
          <p className={`mt-1 font-semibold ${enabled ? "text-emerald-700" : "text-slate-400"}`}>
            {enabled ? "Activo" : "Inactivo (LEAD_HUNTER_ENABLED=false)"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Última ejecución</p>
          <p className="mt-1 font-semibold">
            {lastExecution ? formatDateTime(lastExecution.startedAt) : "Sin ejecuciones todavía"}
          </p>
          {lastExecution && (
            <span className={`badge mt-1 ${STATUS_BADGE[lastExecution.status]}`}>{lastExecution.status}</span>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Próxima ejecución estimada</p>
          <p className="mt-1 font-semibold">{formatDateTime(nextCronRun())}</p>
          <p className="text-xs text-slate-400">Cron diario 13:00 UTC (8:00 a.m. Colombia)</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Leads encontrados hoy</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{todayAgg._sum.created ?? 0}</p>
          <p className="text-xs text-slate-400">
            {todayAgg._sum.duplicates ?? 0} duplicados · {todayAgg._sum.invalid ?? 0} inválidos ·{" "}
            {todayAgg._sum.failed ?? 0} fallidos
          </p>
        </div>
      </section>

      {(!apifyConfigured || !aiConfigured) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {!apifyConfigured && <p>⚠ APIFY_TOKEN no configurado — corre en modo simulado con datos de prueba.</p>}
          {!aiConfigured && <p>⚠ OPENAI_API_KEY no configurado — usa solo el motor de recomendación por reglas (sin IA).</p>}
        </div>
      )}

      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Últimos 7 días</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-slate-500">Creados</dt>
              <dd className="font-semibold">{last7Agg._sum.created ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Duplicados</dt>
              <dd className="font-semibold">{last7Agg._sum.duplicates ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Inválidos</dt>
              <dd className="font-semibold">{last7Agg._sum.invalid ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Fallidos</dt>
              <dd className="font-semibold">{last7Agg._sum.failed ?? 0}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Últimos 30 días</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-slate-500">Creados</dt>
              <dd className="font-semibold">{last30Agg._sum.created ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Duplicados</dt>
              <dd className="font-semibold">{last30Agg._sum.duplicates ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Inválidos</dt>
              <dd className="font-semibold">{last30Agg._sum.invalid ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Fallidos</dt>
              <dd className="font-semibold">{last30Agg._sum.failed ?? 0}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Ejecutar ahora</h2>
        <p className="mb-3 text-xs text-slate-500">
          Corre inmediatamente las 14 búsquedas configuradas (mismo pipeline que el cron diario).
          Sujeto a un límite de 1 ejecución por minuto.
        </p>
        <LeadHunterRunButton />
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Historial de ejecuciones</h2>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <select name="status" defaultValue={params.status ?? ""} className="input w-auto text-xs">
              <option value="">Todos los estados</option>
              {VALID_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input type="date" name="from" defaultValue={params.from} className="input w-auto text-xs" />
            <input type="date" name="to" defaultValue={params.to} className="input w-auto text-xs" />
            <button className="btn-secondary text-xs">Filtrar</button>
          </form>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Origen</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Búsquedas</th>
              <th className="px-4 py-2">Encontrados</th>
              <th className="px-4 py-2">Creados</th>
              <th className="px-4 py-2">Duplicados</th>
              <th className="px-4 py-2">Inválidos</th>
              <th className="px-4 py-2">Fallidos</th>
              <th className="px-4 py-2">CSV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {executions.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  Sin ejecuciones todavía.
                </td>
              </tr>
            )}
            {executions.map((exec) => (
              <tr key={exec.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                  {formatDateTime(exec.startedAt)}
                </td>
                <td className="px-4 py-2 text-xs">{exec.triggerType}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${STATUS_BADGE[exec.status]}`}>{exec.status}</span>
                  {exec.errorSummary && (
                    <p className="mt-1 max-w-xs truncate text-xs text-red-600" title={exec.errorSummary}>
                      {exec.errorSummary}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums">{exec.queriesExecuted}</td>
                <td className="px-4 py-2 tabular-nums">{exec.rawResults}</td>
                <td className="px-4 py-2 font-medium tabular-nums text-emerald-700">{exec.created}</td>
                <td className="px-4 py-2 tabular-nums text-slate-500">{exec.duplicates}</td>
                <td className="px-4 py-2 tabular-nums text-slate-500">{exec.invalid}</td>
                <td className="px-4 py-2 tabular-nums text-slate-500">{exec.failed}</td>
                <td className="px-4 py-2">
                  <a
                    className="text-xs text-blue-600 hover:underline"
                    href={`/api/admin/lead-hunter/executions/${exec.id}/export`}
                  >
                    Descargar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Búsqueda manual puntual (legado)</h2>
        <p className="mb-3 text-xs text-slate-500">
          Búsqueda de 1 ciudad + 1 categoría a la vez, aparte de las 14 búsquedas automáticas de arriba.
        </p>
        <HunterForm cities={[...cities]} categories={[...categories]} />
      </section>

      {legacyRuns.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            Historial de búsquedas manuales puntuales
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Búsqueda</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Resultados</th>
                <th className="px-4 py-2">Nuevos</th>
                <th className="px-4 py-2">Duplicados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {legacyRuns.map((run) => {
                const input = run.input as { city?: string; category?: string };
                return (
                  <tr key={run.id}>
                    <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(run.startedAt)}</td>
                    <td className="px-4 py-2">
                      {input.category} en {input.city}
                      {run.actorId === "mock" && <span className="badge ml-2 bg-slate-100 text-slate-500">mock</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`badge ${
                          run.status === "COMPLETADO"
                            ? "bg-emerald-100 text-emerald-800"
                            : run.status === "FALLIDO"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{run.totalResults}</td>
                    <td className="px-4 py-2 font-medium tabular-nums text-emerald-700">{run.newLeads}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{run.duplicates}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
