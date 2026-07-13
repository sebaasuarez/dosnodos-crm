import { db } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { SettingsForm } from "@/components/forms";
import { formatCop } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, packages, templates, users, session] = await Promise.all([
    getAllSettings(),
    db.servicePackage.findMany({ orderBy: { sortOrder: "asc" } }),
    db.whatsappTemplate.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, active: true } }),
    getSession(),
  ]);

  const isAdmin = session?.role === "ADMIN";
  const integrations = [
    { name: "Kapso (WhatsApp)", configured: Boolean(process.env.KAPSO_API_KEY), env: "KAPSO_API_KEY" },
    { name: "Apify (Lead Hunter)", configured: Boolean(process.env.APIFY_TOKEN), env: "APIFY_TOKEN" },
    { name: "Claude (IA comercial)", configured: Boolean(process.env.ANTHROPIC_API_KEY), env: "ANTHROPIC_API_KEY" },
    { name: "Google Calendar", configured: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID), env: "GOOGLE_CALENDAR_CLIENT_ID" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Configuración</h1>
        <p className="text-sm text-slate-500">
          Límites de envío, Lead Hunter, IA, paquetes, plantillas y usuarios.
        </p>
      </header>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Estado de integraciones</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((integration) => (
            <div key={integration.name} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-sm font-medium">{integration.name}</p>
              {integration.configured ? (
                <span className="badge bg-emerald-100 text-emerald-800">Configurada</span>
              ) : (
                <span className="badge bg-amber-100 text-amber-800" title={`Configura ${integration.env}`}>
                  Modo simulado
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {isAdmin ? (
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Parámetros operativos</h2>
          <SettingsForm initial={settings} />
        </section>
      ) : (
        <p className="text-sm text-slate-400">Solo un administrador puede editar la configuración.</p>
      )}

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Paquetes comerciales</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <div key={pkg.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{pkg.name}</h3>
                {!pkg.active && <span className="badge bg-slate-100 text-slate-500">Inactivo</span>}
              </div>
              {pkg.tagline && <p className="text-xs text-slate-500">{pkg.tagline}</p>}
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {((pkg.features as string[]) ?? []).map((feature) => (
                  <li key={feature}>· {feature}</li>
                ))}
              </ul>
              {pkg.idealFor && <p className="mt-2 text-xs italic text-slate-500">{pkg.idealFor}</p>}
              {(pkg.priceMinCop ?? 0) > 0 && (
                <p className="mt-2 text-sm font-medium text-brand-700">
                  {formatCop(pkg.priceMinCop!)}
                  {pkg.priceMaxCop && pkg.priceMaxCop !== pkg.priceMinCop ? ` – ${formatCop(pkg.priceMaxCop)}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Plantillas de WhatsApp</h2>
        <div className="space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{template.name}</p>
                <span
                  className={`badge ${
                    template.status === "APROBADA" ? "bg-emerald-100 text-emerald-800"
                    : template.status === "RECHAZADA" ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {template.status}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{template.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Usuarios del CRM</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Nombre</th>
              <th className="py-2">Correo</th>
              <th className="py-2">Rol</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="py-2">{user.name}</td>
                <td className="py-2 text-slate-500">{user.email}</td>
                <td className="py-2"><span className="badge bg-slate-100 text-slate-600">{user.role}</span></td>
                <td className="py-2">
                  {user.active
                    ? <span className="badge bg-emerald-100 text-emerald-800">Activo</span>
                    : <span className="badge bg-slate-100 text-slate-500">Inactivo</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
