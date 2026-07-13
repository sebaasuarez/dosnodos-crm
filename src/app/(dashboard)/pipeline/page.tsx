import Link from "next/link";
import { db } from "@/lib/db";
import { LEAD_STATUS_LABELS, PIPELINE_STAGES, scoreColor } from "@/lib/format";
import { StageSelect } from "@/components/client-actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const leads = await db.lead.findMany({
    where: { status: { in: PIPELINE_STAGES } },
    orderBy: { score: "desc" },
    select: {
      id: true, companyName: true, city: true, category: true,
      score: true, status: true, recommendedService: true,
    },
  });

  const byStage = new Map(PIPELINE_STAGES.map((s) => [s, [] as typeof leads]));
  for (const lead of leads) byStage.get(lead.status)?.push(lead);

  const stageOptions = Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="flex h-full flex-col space-y-4">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Pipeline comercial</h1>
        <p className="text-sm text-slate-500">
          {leads.length} leads activos · cambia la etapa desde cada tarjeta
        </p>
      </header>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex min-h-96 gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = byStage.get(stage) ?? [];
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-200/70 px-3 py-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {LEAD_STATUS_LABELS[stage]}
                  </h2>
                  <span className="text-xs font-medium text-slate-500">{stageLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {stageLeads.slice(0, 25).map((lead) => (
                    <div key={lead.id} className="card space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-sm font-medium leading-tight hover:text-brand-600"
                        >
                          {lead.companyName}
                        </Link>
                        <span className={`badge shrink-0 ${scoreColor(lead.score)}`}>{lead.score}</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {lead.category ?? "—"} · {lead.city ?? "—"}
                      </p>
                      {lead.recommendedService && (
                        <p className="truncate text-xs text-brand-700" title={lead.recommendedService}>
                          → {lead.recommendedService}
                        </p>
                      )}
                      <StageSelect leadId={lead.id} current={lead.status} stages={stageOptions} />
                    </div>
                  ))}
                  {stageLeads.length > 25 && (
                    <p className="px-2 text-xs text-slate-400">+{stageLeads.length - 25} más…</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
