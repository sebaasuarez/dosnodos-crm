import Link from "next/link";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { MetricCard } from "@/components/charts";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const week = new Date(Date.now() - 7 * 86400000);

  const [
    withoutConsent, optIn, optOut, noContact, blockedToday, sentToday,
    dailyLimit, hoursStart, hoursEnd,
    weekSent, weekResponses, templates, recentBlocked, doNotContact,
  ] = await Promise.all([
    db.lead.count({ where: { consentStatus: "SIN_CONSENTIMIENTO" } }),
    db.lead.count({ where: { consentStatus: "OPT_IN" } }),
    db.lead.count({ where: { consentStatus: "OPT_OUT" } }),
    db.lead.count({ where: { status: "NO_CONTACTAR" } }),
    db.message.count({ where: { status: "BLOQUEADO", createdAt: { gte: dayStart } } }),
    db.message.count({ where: { direction: "SALIENTE", status: { not: "BLOQUEADO" }, createdAt: { gte: dayStart } } }),
    getSetting("whatsapp.dailyLimit"),
    getSetting("whatsapp.allowedHoursStart"),
    getSetting("whatsapp.allowedHoursEnd"),
    db.message.count({ where: { direction: "SALIENTE", status: { not: "BLOQUEADO" }, createdAt: { gte: week } } }),
    db.message.count({ where: { direction: "ENTRANTE", createdAt: { gte: week } } }),
    db.whatsappTemplate.findMany({ orderBy: { updatedAt: "desc" } }),
    db.message.findMany({
      where: { status: "BLOQUEADO" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { lead: { select: { id: true, companyName: true } } },
    }),
    db.lead.findMany({
      where: { OR: [{ consentStatus: "OPT_OUT" }, { status: "NO_CONTACTAR" }] },
      orderBy: { optOutDate: "desc" },
      take: 30,
      select: { id: true, companyName: true, phone: true, consentStatus: true, status: true, optOutDate: true },
    }),
  ]);

  const responseRate = weekSent > 0 ? Math.round((weekResponses / weekSent) * 100) : 0;
  const limitUsage = Math.round((sentToday / dailyLimit) * 100);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Cumplimiento y reputación</h1>
        <p className="text-sm text-slate-500">
          El sistema bloquea automáticamente: envíos sin opt-in, fuera de horario
          ({hoursStart}:00–{hoursEnd}:00), sobre el límite diario y a leads con opt-out.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Sin consentimiento" value={withoutConsent} hint="No reciben WhatsApp" />
        <MetricCard label="Con opt-in" value={optIn} tone="good" />
        <MetricCard label="Opt-out" value={optOut} tone={optOut > 0 ? "warn" : "default"} />
        <MetricCard label="No contactar" value={noContact} />
        <MetricCard label="Bloqueados hoy" value={blockedToday} tone={blockedToday > 5 ? "warn" : "default"} />
        <MetricCard
          label="Límite diario usado"
          value={`${sentToday}/${dailyLimit}`}
          hint={`${limitUsage}%`}
          tone={limitUsage >= 90 ? "bad" : limitUsage >= 70 ? "warn" : "default"}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <MetricCard
          label="Tasa de respuesta (7 días)"
          value={`${responseRate}%`}
          hint={responseRate < 15 && weekSent > 10 ? "⚠ Baja — revisa mensajes y audiencias" : "Salud del número"}
          tone={responseRate < 15 && weekSent > 10 ? "warn" : "good"}
        />
        <MetricCard label="Mensajes enviados (7 días)" value={weekSent} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Estado de plantillas</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">Sin plantillas registradas.</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center justify-between text-sm">
                  <span>{template.name}</span>
                  <span
                    className={`badge ${
                      template.status === "APROBADA" ? "bg-emerald-100 text-emerald-800"
                      : template.status === "RECHAZADA" ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {template.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Lista de no contactar</h2>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {doNotContact.length === 0 && <li className="text-slate-400">Vacía.</li>}
            {doNotContact.map((lead) => (
              <li key={lead.id} className="flex justify-between">
                <Link href={`/leads/${lead.id}`} className="hover:text-brand-600">{lead.companyName}</Link>
                <span className="text-xs text-slate-400">
                  {lead.consentStatus === "OPT_OUT" ? "Opt-out" : "No contactar"} · {formatDateTime(lead.optOutDate)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Mensajes bloqueados recientes
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Lead</th>
              <th className="px-4 py-2">Razón del bloqueo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recentBlocked.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin bloqueos. 👌</td></tr>
            )}
            {recentBlocked.map((message) => (
              <tr key={message.id}>
                <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(message.createdAt)}</td>
                <td className="px-4 py-2">
                  {message.lead ? (
                    <Link href={`/leads/${message.lead.id}`} className="hover:text-brand-600">
                      {message.lead.companyName}
                    </Link>
                  ) : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-red-700">{message.failedReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
