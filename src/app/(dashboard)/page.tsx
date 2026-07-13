import Link from "next/link";
import { dashboardSummary } from "@/lib/reports";
import { BarChart, FunnelBars, MetricCard } from "@/components/charts";
import { LEAD_STATUS_LABELS, PIPELINE_STAGES, formatCop, formatDate, scoreColor, consentColor, CONSENT_LABELS } from "@/lib/format";
import type { LeadStatus, ConsentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const summary = await dashboardSummary();
  const d = summary.daily;

  const funnelStages = PIPELINE_STAGES.filter((s) => !["PERDIDO"].includes(s)).map((stage) => ({
    label: LEAD_STATUS_LABELS[stage],
    count: (summary.funnel as Record<string, number>)[stage] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Resumen general</h1>
          <p className="text-sm text-slate-500">
            {new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "America/Bogota" }).format(new Date())}
          </p>
        </div>
        <Link href="/lead-hunter" className="btn-primary shrink-0">
          ◎ Buscar leads hoy
        </Link>
      </header>

      {/* Métricas del día */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Leads hoy" value={d.leadsToday} />
        <MetricCard label="Calificados hoy" value={d.qualifiedToday} />
        <MetricCard label="Score alto (81+)" value={d.highScore} tone={d.highScore > 0 ? "good" : "default"} />
        <MetricCard label="Con opt-in" value={d.withConsent} />
        <MetricCard label="Mensajes hoy" value={d.messagesSentToday} />
        <MetricCard label="Respuestas hoy" value={d.responsesToday} />
        <MetricCard label="Tasa respuesta 7d" value={`${d.responseRate}%`} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <MetricCard label="Conv. activas" value={d.activeConversations} />
        <MetricCard label="Esperando humano" value={d.pendingHuman} tone={d.pendingHuman > 0 ? "warn" : "default"} />
        <MetricCard label="Reuniones" value={d.meetingsScheduled} />
        <MetricCard label="Propuestas" value={d.proposalsSent} />
        <MetricCard label="Ventas ganadas" value={d.wonTotal} tone="good" />
        <MetricCard label="Pipeline" value={formatCop(d.pipelineValue)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads por día */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Leads capturados — últimos 14 días
          </h2>
          <BarChart data={summary.leadsPerDay} />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{summary.leadsPerDay[0]?.date}</span>
            <span>{summary.leadsPerDay.at(-1)?.date}</span>
          </div>
        </section>

        {/* Embudo */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Embudo comercial</h2>
          <FunnelBars stages={funnelStages} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Oportunidades calientes */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">🔥 Oportunidades calientes</h2>
            <Link href="/leads?scoreMin=61" className="text-xs text-brand-600 hover:underline">
              Ver todas
            </Link>
          </div>
          {summary.hotLeads.length === 0 ? (
            <p className="text-sm text-slate-400">Sin leads de score alto todavía.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.hotLeads.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 py-2">
                  <span className={`badge ${scoreColor(lead.score)}`}>{lead.score}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${lead.id}`} className="block truncate text-sm font-medium hover:text-brand-600">
                      {lead.companyName}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {lead.category ?? "—"} · {lead.city ?? "—"} · {lead.recommendedService ?? ""}
                    </p>
                  </div>
                  <span className={`badge ${consentColor(lead.consentStatus as ConsentStatus)}`}>
                    {CONSENT_LABELS[lead.consentStatus as ConsentStatus]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {LEAD_STATUS_LABELS[lead.status as LeadStatus]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tareas de hoy */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Tareas para hoy</h2>
          {summary.tasksToday.length === 0 ? (
            <p className="text-sm text-slate-400">Sin tareas pendientes para hoy. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.tasksToday.map((task) => (
                <li key={task.id} className="py-2">
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.lead ? (
                      <Link href={`/leads/${task.lead.id}`} className="text-brand-600 hover:underline">
                        {task.lead.companyName}
                      </Link>
                    ) : "General"}
                    {" · vence "}{formatDate(task.dueDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {d.blockedToday > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ Hoy se bloquearon <strong>{d.blockedToday}</strong> mensajes por reglas de cumplimiento
          (sin opt-in, fuera de horario o límites).{" "}
          <Link href="/compliance" className="font-medium underline">Ver centro de cumplimiento</Link>
        </div>
      )}
    </div>
  );
}
