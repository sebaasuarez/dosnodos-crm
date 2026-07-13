import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CampaignActions } from "@/components/client-actions";
import { formatDateTime, CONSENT_LABELS, consentColor } from "@/lib/format";
import type { ConsentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      recipients: {
        include: { lead: { select: { id: true, companyName: true, consentStatus: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        take: 300,
      },
    },
  });
  if (!campaign) notFound();

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/campaigns" className="text-xs text-slate-400 hover:text-brand-600">← Campañas</Link>
          <h1 className="text-xl font-semibold sm:text-2xl">{campaign.name}</h1>
          <p className="text-sm text-slate-500">
            {campaign.type} · {campaign.channel} · {campaign.status} · límite {campaign.dailyLimit}/día
          </p>
        </div>
        <CampaignActions campaignId={campaign.id} status={campaign.status} />
      </header>

      {campaign.template && (
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Plantilla: {campaign.template.name}
            <span className="badge ml-2 bg-slate-100 text-slate-500">{campaign.template.status}</span>
          </h2>
          <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {campaign.template.body}
          </p>
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Destinatarios ({campaign.recipients.length})
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Lead</th>
              <th className="px-4 py-2">Consentimiento</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Enviado</th>
              <th className="px-4 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campaign.recipients.map((recipient) => (
              <tr key={recipient.id}>
                <td className="px-4 py-2">
                  <Link href={`/leads/${recipient.lead.id}`} className="font-medium hover:text-brand-600">
                    {recipient.lead.companyName}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span className={`badge ${consentColor(recipient.lead.consentStatus as ConsentStatus)}`}>
                    {CONSENT_LABELS[recipient.lead.consentStatus as ConsentStatus]}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`badge ${
                      recipient.status === "ENVIADO" ? "bg-emerald-100 text-emerald-800"
                      : recipient.status === "RESPONDIO" ? "bg-brand-100 text-brand-800"
                      : recipient.status === "BLOQUEADO" ? "bg-red-100 text-red-800"
                      : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {recipient.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(recipient.sentAt)}</td>
                <td className="max-w-md px-4 py-2 text-xs text-slate-500">{recipient.blockedReason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
