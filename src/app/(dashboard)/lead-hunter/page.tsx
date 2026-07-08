import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { HunterForm } from "@/components/forms";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LeadHunterPage() {
  const [cities, categories, runs] = await Promise.all([
    getSetting("leadHunter.cities"),
    getSetting("leadHunter.categories"),
    db.apifyRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
  ]);

  const apifyConfigured = Boolean(process.env.APIFY_TOKEN);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Lead Hunter</h1>
        <p className="text-sm text-slate-500">
          Captura diaria de prospectos desde Google Maps (Apify). Los leads entran{" "}
          <strong>sin consentimiento de WhatsApp</strong> y pasan por enriquecimiento,
          scoring y captación de opt-in antes de cualquier contacto.
        </p>
      </header>

      {!apifyConfigured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ APIFY_TOKEN no configurado — el Lead Hunter corre en <strong>modo simulado</strong> con
          datos de prueba realistas. Configura el token en las variables de entorno para usar el
          scraper real.
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Ejecutar búsqueda manual</h2>
        <HunterForm cities={[...cities]} categories={[...categories]} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Historial de ejecuciones
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Búsqueda</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Resultados</th>
              <th className="px-4 py-2">Nuevos</th>
              <th className="px-4 py-2">Duplicados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Sin ejecuciones todavía. Lanza la primera búsqueda arriba.
                </td>
              </tr>
            )}
            {runs.map((run) => {
              const input = run.input as { city?: string; category?: string };
              return (
                <tr key={run.id}>
                  <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(run.startedAt)}</td>
                  <td className="px-4 py-2">
                    {input.category} en {input.city}
                    {run.actorId === "mock" && (
                      <span className="badge ml-2 bg-slate-100 text-slate-500">mock</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge ${
                        run.status === "COMPLETADO"
                          ? "bg-emerald-100 text-emerald-800"
                          : run.status === "FALLIDO"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {run.status}
                    </span>
                    {run.error && <p className="text-xs text-red-600">{run.error.slice(0, 120)}</p>}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{run.totalResults}</td>
                  <td className="px-4 py-2 font-medium tabular-nums text-emerald-700">{run.newLeads}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-500">{run.duplicates}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
