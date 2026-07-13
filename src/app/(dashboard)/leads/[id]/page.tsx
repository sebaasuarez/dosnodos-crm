import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  LEAD_STATUS_LABELS, CONSENT_LABELS, SOURCE_LABELS,
  scoreColor, consentColor, formatDate, formatDateTime, formatCop,
} from "@/lib/format";
import { scorePriority } from "@/lib/scoring";
import { StageSelect, ConsentButtons, RecalcScoreButton } from "@/components/client-actions";
import { NoteForm, TaskForm, MeetingForm } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      tasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      opportunities: { orderBy: { createdAt: "desc" } },
      meetings: { orderBy: { scheduledAt: "desc" } },
      consentEvents: { orderBy: { createdAt: "desc" } },
      conversations: { orderBy: { updatedAt: "desc" } },
      scoreHistory: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!lead) notFound();

  const priority = scorePriority(lead.score);
  const breakdown = (lead.scoreBreakdown ?? []) as { label: string; points: number }[];
  const social = (lead.socialMedia ?? {}) as Record<string, string>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/leads" className="text-xs text-slate-400 hover:text-brand-600">← Leads</Link>
          <h1 className="text-xl font-semibold sm:text-2xl">{lead.companyName}</h1>
          <p className="text-sm text-slate-500">
            {lead.category ?? "Sin categoría"} · {lead.city ?? "—"} · Fuente: {SOURCE_LABELS[lead.source]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${scoreColor(lead.score)}`} title={priority.label}>
            Score {lead.score} — {priority.label}
          </span>
          <span className={`badge ${consentColor(lead.consentStatus)}`}>
            {CONSENT_LABELS[lead.consentStatus]}
          </span>
          <StageSelect
            leadId={lead.id}
            current={lead.status}
            stages={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Columna 1: datos + score */}
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Datos del negocio</h2>
            <dl className="space-y-2 text-sm">
              {[
                ["Contacto", lead.contactName],
                ["Teléfono", lead.phone],
                ["Email", lead.email],
                ["Dirección", lead.address],
                ["Horario", lead.openingHours],
              ].map(([label, value]) =>
                value ? (
                  <div key={label as string} className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ) : null,
              )}
              {lead.website && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Sitio web</dt>
                  <dd><a href={lead.website} target="_blank" className="text-brand-600 hover:underline">{lead.website}</a></dd>
                </div>
              )}
              {lead.googleMapsUrl && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Google Maps</dt>
                  <dd>
                    <a href={lead.googleMapsUrl} target="_blank" className="text-brand-600 hover:underline">
                      Ver ficha {lead.rating ? `(★ ${lead.rating}, ${lead.reviewsCount} reseñas)` : ""}
                    </a>
                  </dd>
                </div>
              )}
              {Object.entries(social).map(([network, url]) => (
                <div key={network} className="flex gap-2">
                  <dt className="w-24 shrink-0 capitalize text-slate-500">{network}</dt>
                  <dd><a href={url} target="_blank" className="text-brand-600 hover:underline">{url}</a></dd>
                </div>
              ))}
              {(lead.utmSource || lead.utmCampaign) && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">UTM</dt>
                  <dd className="text-xs">{lead.utmSource ?? "—"} / {lead.utmMedium ?? "—"} / {lead.utmCampaign ?? "—"}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Análisis de oportunidad</h2>
              <RecalcScoreButton leadId={lead.id} />
            </div>
            {lead.digitalOpportunitySummary && (
              <p className="mb-3 text-sm text-slate-600">{lead.digitalOpportunitySummary}</p>
            )}
            {lead.recommendedService && (
              <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm">
                <p className="font-medium text-brand-900">→ {lead.recommendedService}</p>
                {lead.recommendedPackage && (
                  <p className="text-xs text-brand-700">Paquete sugerido: {lead.recommendedPackage}</p>
                )}
              </div>
            )}
            {breakdown.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-600">
                {breakdown.map((item) => (
                  <li key={item.label} className="flex justify-between">
                    <span>{item.label}</span>
                    <span className="font-medium tabular-nums">+{item.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Consentimiento</h2>
            <ConsentButtons leadId={lead.id} consentStatus={lead.consentStatus} />
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {lead.consentEvents.length === 0 && (
                <li className="text-slate-400">
                  Sin eventos de consentimiento. Este lead NO puede recibir WhatsApp proactivo.
                </li>
              )}
              {lead.consentEvents.map((event) => (
                <li key={event.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="font-medium">
                    {event.type} · {event.channel} · {formatDateTime(event.createdAt)}
                  </p>
                  {event.source && <p>Fuente: {event.source}</p>}
                  {event.evidence && <p className="italic text-slate-500">&ldquo;{event.evidence}&rdquo;</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Columna 2: actividad */}
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Conversaciones</h2>
            {lead.conversations.length === 0 ? (
              <p className="text-sm text-slate-400">Sin conversaciones de WhatsApp.</p>
            ) : (
              <ul className="space-y-2">
                {lead.conversations.map((conv) => (
                  <li key={conv.id}>
                    <Link
                      href={`/inbox?c=${conv.id}`}
                      className="block rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:border-brand-400"
                    >
                      <span className="font-medium">{conv.status}</span>
                      <span className="text-xs text-slate-500"> · último mensaje {formatDateTime(conv.lastMessageAt)}</span>
                      {conv.nextAction && <p className="text-xs text-amber-700">Próximo paso: {conv.nextAction}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Oportunidades</h2>
            {lead.opportunities.length === 0 ? (
              <p className="text-sm text-slate-400">Sin oportunidades registradas.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lead.opportunities.map((opp) => (
                  <li key={opp.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{opp.service}</span>
                      <span className="badge bg-slate-100 text-slate-600">{opp.stage}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {opp.estimatedValue > 0 ? formatCop(opp.estimatedValue) : "Sin valor estimado"} · {opp.probability}% prob.
                    </p>
                    {opp.notes && <p className="text-xs text-slate-500">{opp.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Reuniones</h2>
            <MeetingForm leadId={lead.id} />
            <ul className="mt-3 space-y-1 text-sm">
              {lead.meetings.map((meeting) => (
                <li key={meeting.id} className="flex justify-between text-slate-600">
                  <span>{meeting.title}</span>
                  <span className="text-xs">{formatDateTime(meeting.scheduledAt)} · {meeting.status}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Columna 3: notas y tareas */}
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Tareas</h2>
            <TaskForm leadId={lead.id} />
            <ul className="mt-3 space-y-2 text-sm">
              {lead.tasks.map((task) => (
                <li key={task.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className={task.status === "COMPLETADA" ? "text-slate-400 line-through" : ""}>
                      {task.title}
                    </p>
                    {task.description && <p className="text-xs text-slate-500">{task.description}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{formatDate(task.dueDate)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Notas internas</h2>
            <NoteForm leadId={lead.id} />
            <ul className="mt-3 space-y-2">
              {lead.notes.map((note) => (
                <li key={note.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <p>{note.content}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {note.author?.name ?? "Sistema"} · {formatDateTime(note.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {lead.nextStep && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <p className="text-xs font-semibold uppercase">Próximo paso</p>
              <p>{lead.nextStep}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
