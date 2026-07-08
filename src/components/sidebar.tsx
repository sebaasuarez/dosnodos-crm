"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "Resumen", icon: "◧" },
  { href: "/leads", label: "Leads", icon: "☰" },
  { href: "/lead-hunter", label: "Lead Hunter", icon: "◎" },
  { href: "/pipeline", label: "Pipeline", icon: "⫞" },
  { href: "/inbox", label: "WhatsApp", icon: "◈" },
  { href: "/campaigns", label: "Campañas", icon: "➤" },
  { href: "/agenda", label: "Agenda", icon: "▤" },
  { href: "/compliance", label: "Cumplimiento", icon: "✓" },
  { href: "/reports", label: "Reportes", icon: "∿" },
  { href: "/logs", label: "Logs", icon: "≡" },
  { href: "/settings", label: "Configuración", icon: "⚙" },
];

export function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          DN
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Dos Nodos</p>
          <p className="text-[11px] text-slate-400">Growth CRM</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-brand-600/20 font-medium text-white"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <p className="truncate text-sm font-medium text-white">{userName}</p>
        <p className="text-[11px] uppercase text-slate-500">{userRole}</p>
        <button
          onClick={logout}
          className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
