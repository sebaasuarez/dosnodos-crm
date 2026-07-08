import Link from "next/link";
import { db } from "@/lib/db";
import {
  LEAD_STATUS_LABELS, CONSENT_LABELS, SOURCE_LABELS,
  scoreColor, consentColor, formatDate,
} from "@/lib/format";
import type { Prisma, LeadStatus, ConsentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const where: Prisma.LeadWhereInput = {};
  if (params.q) {
    where.OR = [
      { companyName: { contains: params.q, mode: "insensitive" } },
      { contactName: { contains: params.q, mode: "insensitive" } },
      { phone: { contains: params.q } },
    ];
  }
  if (params.status) where.status = params.status as LeadStatus;
  if (params.consent) where.consentStatus = params.consent as ConsentStatus;
  if (params.city) where.city = params.city;
  if (params.scoreMin) where.score = { gte: Number(params.scoreMin) };

  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 30;
  const [leads, total, cities] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.lead.count({ where }),
    db.lead.findMany({
      where: { city: { not: null } },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-slate-500">{total} leads en total</p>
        </div>
        <a href="/api/reports/export" className="btn-secondary text-sm">⬇ Exportar CSV</a>
      </header>

      {/* Filtros (form GET, sin JS) */}
      <form method="GET" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600">Buscar</label>
          <input name="q" defaultValue={params.q} className="input" placeholder="Nombre, contacto o teléfono" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Etapa</label>
          <select name="status" defaultValue={params.status ?? ""} className="input w-auto">
            <option value="">Todas</option>
            {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Consentimiento</label>
          <select name="consent" defaultValue={params.consent ?? ""} className="input w-auto">
            <option value="">Todos</option>
            {Object.entries(CONSENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Ciudad</label>
          <select name="city" defaultValue={params.city ?? ""} className="input w-auto">
            <option value="">Todas</option>
            {cities.map((c) => (
              <option key={c.city!} value={c.city!}>{c.city}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Score mín.</label>
          <input name="scoreMin" type="number" min={0} max={100} defaultValue={params.scoreMin} className="input w-20" />
        </div>
        <button className="btn-primary text-sm">Filtrar</button>
        <Link href="/leads" className="btn-secondary text-sm">Limpiar</Link>
      </form>

      {/* Tabla */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">Ciudad</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Consentimiento</th>
              <th className="px-4 py-3">Fuente</th>
              <th className="px-4 py-3">Servicio recomendado</th>
              <th className="px-4 py-3">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No hay leads con estos filtros. Ejecuta el{" "}
                  <Link href="/lead-hunter" className="text-brand-600 underline">Lead Hunter</Link>{" "}
                  para capturar nuevos.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                    {lead.companyName}
                  </Link>
                  {lead.phone && <p className="text-xs text-slate-400">{lead.phone}</p>}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{lead.city ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{lead.category ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`badge ${scoreColor(lead.score)}`}>{lead.score}</span>
                </td>
                <td className="px-4 py-2.5 text-xs">{LEAD_STATUS_LABELS[lead.status]}</td>
                <td className="px-4 py-2.5">
                  <span className={`badge ${consentColor(lead.consentStatus)}`}>
                    {CONSENT_LABELS[lead.consentStatus]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{SOURCE_LABELS[lead.source]}</td>
                <td className="max-w-52 truncate px-4 py-2.5 text-xs text-slate-500" title={lead.recommendedService ?? ""}>
                  {lead.recommendedService ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(lead.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {total > pageSize && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/leads?${new URLSearchParams({ ...params, page: String(page - 1) } as Record<string, string>)}`}
              className="btn-secondary text-xs"
            >
              ← Anterior
            </Link>
          )}
          <span className="text-slate-500">
            Página {page} de {Math.ceil(total / pageSize)}
          </span>
          {page * pageSize < total && (
            <Link
              href={`/leads?${new URLSearchParams({ ...params, page: String(page + 1) } as Record<string, string>)}`}
              className="btn-secondary text-xs"
            >
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
