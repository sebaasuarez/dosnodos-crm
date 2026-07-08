"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(searchParams.get("next") ?? "/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error al iniciar sesión");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4 p-8">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
          DN
        </div>
        <h1 className="text-xl font-semibold">Dos Nodos Growth CRM</h1>
        <p className="text-sm text-slate-500">Conectamos tecnología con personas</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Correo</label>
        <input
          type="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@dosnodos.com.co"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Contraseña</label>
        <input
          type="password"
          required
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
