import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; action?: string }>;
}) {
  const params = await searchParams;
  const logs = await db.auditLog.findMany({
    where: {
      ...(params.level ? { level: params.level } : {}),
      ...(params.action ? { action: { contains: params.action } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Logs y auditoría</h1>
        <p className="text-sm text-slate-500">
          Trazabilidad completa: leads, mensajes, bloqueos, campañas, jobs y configuración.
        </p>
      </header>

      <form method="GET" className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Nivel</label>
          <select name="level" defaultValue={params.level ?? ""} className="input w-auto">
            <option value="">Todos</option>
            <option value="info">Info</option>
            <option value="warn">Advertencia</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Acción contiene</label>
          <input name="action" defaultValue={params.action} className="input" placeholder="lead., message.blocked…" />
        </div>
        <button className="btn-primary text-sm">Filtrar</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Nivel</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Acción</th>
              <th className="px-4 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                  {formatDateTime(log.createdAt)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`badge ${
                      log.level === "error" ? "bg-red-100 text-red-800"
                      : log.level === "warn" ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {log.level}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs">{log.user?.name ?? log.actor}</td>
                <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-[11px] text-slate-500" title={JSON.stringify(log.detail)}>
                  {log.detail ? JSON.stringify(log.detail) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
