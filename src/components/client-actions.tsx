"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Acciones cliente pequeñas y reutilizables del CRM. */

export function StageSelect({
  leadId,
  current,
  stages,
}: {
  leadId: string;
  current: string;
  stages: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function change(status: string) {
    setSaving(true);
    let body: Record<string, unknown> = { status };
    if (status === "PERDIDO") {
      const reason = window.prompt("Motivo de pérdida:");
      if (reason === null) {
        setSaving(false);
        return;
      }
      body = { status, lostReason: reason };
    }
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      className="input w-auto text-xs"
      value={current}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
    >
      {stages.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function ConsentButtons({ leadId, consentStatus }: { leadId: string; consentStatus: string }) {
  const router = useRouter();

  async function optIn() {
    const source = window.prompt(
      "Fuente del consentimiento (obligatorio para trazabilidad):\nEj: 'formulario landing 2026-07-01', 'escribió por click-to-WhatsApp'",
    );
    if (!source) return;
    const res = await fetch("/api/opt-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, channel: "manual", source }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "No se pudo registrar el opt-in");
    }
    router.refresh();
  }

  async function optOut() {
    if (!window.confirm("¿Marcar este lead como opt-out? No recibirá más mensajes.")) return;
    await fetch("/api/opt-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {consentStatus !== "OPT_IN" && consentStatus !== "OPT_OUT" && (
        <button onClick={optIn} className="btn-secondary text-xs">
          Registrar opt-in
        </button>
      )}
      {consentStatus !== "OPT_OUT" && (
        <button onClick={optOut} className="btn-secondary text-xs text-red-600">
          Marcar opt-out
        </button>
      )}
    </div>
  );
}

export function RecalcScoreButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="btn-secondary text-xs"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch(`/api/leads/${leadId}/score`, { method: "POST" });
        setLoading(false);
        router.refresh();
      }}
    >
      {loading ? "Calculando…" : "Recalcular score"}
    </button>
  );
}

export function AiToggle({ conversationId, aiEnabled }: { conversationId: string; aiEnabled: boolean }) {
  const router = useRouter();
  return (
    <button
      className={`badge cursor-pointer border ${
        aiEnabled
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-300 bg-slate-50 text-slate-600"
      }`}
      title={aiEnabled ? "La IA responde automáticamente. Clic para tomar control." : "Control humano. Clic para reactivar la IA."}
      onClick={async () => {
        await fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiEnabled: !aiEnabled, ...(aiEnabled ? {} : { status: "ABIERTA" }) }),
        });
        router.refresh();
      }}
    >
      {aiEnabled ? "IA activa" : "Control humano"}
    </button>
  );
}

export function CampaignActions({ campaignId, status }: { campaignId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function action(kind: "start" | "pause") {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/${kind}`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Error");
    }
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status !== "ACTIVA" && (
        <button className="btn-primary text-xs" disabled={loading} onClick={() => action("start")}>
          Activar
        </button>
      )}
      {status === "ACTIVA" && (
        <button className="btn-secondary text-xs" disabled={loading} onClick={() => action("pause")}>
          Pausar
        </button>
      )}
    </div>
  );
}
