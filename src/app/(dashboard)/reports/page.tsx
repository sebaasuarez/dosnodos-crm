import { weeklyReport, monthlyReport } from "@/lib/reports";
import { MetricCard, FunnelBars } from "@/components/charts";
import { formatCop, SOURCE_LABELS } from "@/lib/format";
import type { LeadSourceType } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [weekly, monthly] = await Promise.all([weeklyReport(), monthlyReport()]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Reportes</h1>
          <p className="text-sm text-slate-500">Vista semanal y mensual del desempeño comercial</p>
        </div>
        <a href="/api/reports/export" className="btn-secondary shrink-0 text-sm">⬇ Exportar leads (CSV)</a>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Últimos 7 días</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <MetricCard label="Leads nuevos" value={weekly.newLeads} />
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Por fuente</h3>
            <FunnelBars
              stages={weekly.bySource.map((s) => ({
                label: SOURCE_LABELS[s.source as LeadSourceType] ?? s.source,
                count: s._count._all,
              }))}
            />
          </div>
          <div className="card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Mejores ciudades</h3>
            <FunnelBars
              stages={weekly.byCity.map((c) => ({ label: c.city ?? "Sin ciudad", count: c._count._all }))}
            />
          </div>
          <div className="card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Mejores categorías</h3>
            <FunnelBars
              stages={weekly.byCategory.map((c) => ({ label: c.category ?? "Sin categoría", count: c._count._all }))}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Servicios más recomendados</h3>
            <FunnelBars
              stages={weekly.byService.map((s) => ({
                label: s.recommendedService ?? "—",
                count: s._count._all,
              }))}
            />
          </div>
          <div className="card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Leads perdidos y motivo</h3>
            {weekly.lost.length === 0 ? (
              <p className="text-sm text-slate-400">Sin pérdidas esta semana.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {weekly.lost.map((lead, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{lead.companyName}</span>
                    <span className="text-xs text-slate-500">{lead.lostReason ?? "Sin motivo"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Últimos 30 días</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Leads capturados" value={monthly.totalLeads} />
          <MetricCard label="Pipeline abierto" value={`${monthly.pipelineCount} opps`} hint={formatCop(monthly.pipelineValue)} />
          <MetricCard label="Ventas ganadas" value={monthly.wonCount} hint={formatCop(monthly.wonValue)} tone="good" />
          <MetricCard label="Perdidas" value={monthly.lostCount} tone={monthly.lostCount > 0 ? "warn" : "default"} />
          <MetricCard label="Reuniones" value={monthly.meetings} />
          <MetricCard label="Lead → Reunión" value={`${monthly.conversion.leadToMeeting}%`} />
          <MetricCard label="Reunión → Propuesta" value={`${monthly.conversion.meetingToProposal}%`} />
          <MetricCard label="Propuesta → Venta" value={`${monthly.conversion.proposalToSale}%`} />
        </div>
      </section>
    </div>
  );
}
