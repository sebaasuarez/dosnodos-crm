"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        DN
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Dos Nodos</p>
        <p className="text-[11px] text-slate-400">Growth CRM</p>
      </div>
    </div>
  );
}

export function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Cierra el drawer al navegar (en móvil, tras tocar un enlace).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Evita el scroll del fondo mientras el drawer está abierto en móvil.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Barra superior — solo móvil */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <BrandMark />
      </header>

      {/* Fondo oscuro — solo móvil, al abrir el drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
        />
      )}

      {/* Menú lateral: drawer deslizante en móvil, fijo en desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-transform duration-200 lg:static lg:z-auto lg:w-56 lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <BrandMark />
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
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
    </>
  );
}
