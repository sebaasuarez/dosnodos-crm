import Link from "next/link";
import { db } from "@/lib/db";
import { CampaignForm } from "@/components/forms";
import { CampaignActions } from "@/components/client-actions";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  BORRADOR: "bg-slate-100 text-slate-600",
  ACTIVA: "bg-emerald-100 text-emerald-800",
  PAUSADA: "bg-amber-100 text-amber-800",
  FINALIZADA: "bg-slate-100 text-slate-500",
};

export default async function CampaignsPage() {
  const [campaigns, templates] = await Promise.all([
    db.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        template: { select: { name: true } },
        recipients: { select: { status: true } },
      },
    }),
    db.whatsappTemplate.findMany({ where: { status: "APROBADA" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Campañas</h1>
          <p className="text-sm text-slate-500">
            Las campañas de WhatsApp solo envían a leads con opt-in. Los envíos respetan
            límites diarios, horarios y frecuencia por lead.
          </p>
        </div>
      </header>

      <CampaignForm templates={templates} />

      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.length === 0 && (
          <p className="text-sm text-slate-400">Sin campañas. Crea la primera arriba.</p>
        )}
        {campaigns.map((campaign) => {
          const counts = campaign.recipients.reduce(
            (acc, r) => {
              acc[r.status] = (acc[r.status] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );
          return (
            <div key={campaign.id} className="card space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/campaigns/${campaign.id}`} className="font-semibold hover:text-brand-600">
                    {campaign.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {campaign.type} · {campaign.channel} · creada {formatDate(campaign.createdAt)}
                  </p>
                </div>
                <span className={`badge ${STATUS_BADGE[campaign.status]}`}>{campaign.status}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                <span>Pendientes: <strong>{counts.PENDIENTE ?? 0}</strong></span>
                <span>Enviados: <strong>{counts.ENVIADO ?? 0}</strong></span>
                <span>Respondieron: <strong className="text-emerald-700">{counts.RESPONDIO ?? 0}</strong></span>
                <span>Bloqueados: <strong className="text-red-700">{counts.BLOQUEADO ?? 0}</strong></span>
                <span>Límite: {campaign.dailyLimit}/día · {campaign.hourlyLimit}/hora</span>
                {campaign.template && <span>Plantilla: {campaign.template.name}</span>}
              </div>
              <CampaignActions campaignId={campaign.id} status={campaign.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
