import Link from "next/link";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  AGENDADA: "bg-brand-100 text-brand-800",
  CONFIRMADA: "bg-emerald-100 text-emerald-800",
  REALIZADA: "bg-slate-100 text-slate-500",
  NO_ASISTIO: "bg-amber-100 text-amber-800",
  CANCELADA: "bg-red-100 text-red-800",
};

export default async function AgendaPage() {
  const meetings = await db.meeting.findMany({
    orderBy: { scheduledAt: "asc" },
    include: { lead: { select: { id: true, companyName: true, phone: true } } },
    where: { scheduledAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    take: 100,
  });

  const upcoming = meetings.filter((m) => m.scheduledAt >= new Date());
  const past = meetings.filter((m) => m.scheduledAt < new Date());

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Agenda</h1>
        <p className="text-sm text-slate-500">
          Reuniones y llamadas de diagnóstico. La integración con Google Calendar es opcional
          (variables GOOGLE_CALENDAR_*).
        </p>
      </header>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Próximas reuniones</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">
            Sin reuniones agendadas. Agenda desde el detalle de un lead.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((meeting) => (
              <li key={meeting.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{meeting.title}</p>
                  <Link href={`/leads/${meeting.lead.id}`} className="text-xs text-brand-600 hover:underline">
                    {meeting.lead.companyName}
                  </Link>
                  {meeting.lead.phone && <span className="text-xs text-slate-400"> · {meeting.lead.phone}</span>}
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{formatDateTime(meeting.scheduledAt)}</p>
                  <span className={`badge ${STATUS_BADGE[meeting.status]}`}>{meeting.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Últimos 7 días</h2>
          <ul className="divide-y divide-slate-100">
            {past.reverse().map((meeting) => (
              <li key={meeting.id} className="flex items-center justify-between gap-3 py-2 text-sm text-slate-600">
                <span>
                  {meeting.title} —{" "}
                  <Link href={`/leads/${meeting.lead.id}`} className="text-brand-600 hover:underline">
                    {meeting.lead.companyName}
                  </Link>
                </span>
                <span className="text-xs">{formatDateTime(meeting.scheduledAt)} · {meeting.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
