"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Formularios cliente del CRM. Todos usan la API interna y refrescan la vista. */

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error ?? `Error HTTP ${res.status}` };
}

export function NoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!content.trim()) return;
        await postJson(`/api/leads/${leadId}/notes`, { content });
        setContent("");
        router.refresh();
      }}
    >
      <input
        className="input"
        placeholder="Agregar nota interna…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button className="btn-secondary text-xs">Guardar</button>
    </form>
  );
}

export function TaskForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await postJson(`/api/leads/${leadId}/tasks`, {
          title,
          dueDate: dueDate || undefined,
        });
        setTitle("");
        setDueDate("");
        router.refresh();
      }}
    >
      <input
        className="input flex-1"
        placeholder="Nueva tarea…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="date"
        className="input w-auto"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
      <button className="btn-secondary text-xs">Crear</button>
    </form>
  );
}

export function MeetingForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("Llamada de diagnóstico (15 min)");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!scheduledAt) return;
        const result = await postJson("/api/meetings", {
          leadId,
          title,
          scheduledAt: new Date(scheduledAt).toISOString(),
        });
        setError(result.ok ? null : (result.error ?? "Error"));
        if (result.ok) setScheduledAt("");
        router.refresh();
      }}
    >
      <input className="input flex-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input
        type="datetime-local"
        className="input w-auto"
        value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
        required
      />
      <button className="btn-primary text-xs">Agendar</button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  return (
    <form
      className="space-y-1"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!content.trim()) return;
        setSending(true);
        const result = await postJson(`/api/conversations/${conversationId}/messages`, { content });
        setSending(false);
        if (result.ok) {
          setContent("");
          setError(null);
        } else {
          setError(result.error ?? "Error al enviar");
        }
        router.refresh();
      }}
    >
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Escribe una respuesta…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button className="btn-primary" disabled={sending}>
          {sending ? "…" : "Enviar"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">⚠ {error}</p>}
    </form>
  );
}

export function HunterForm({ cities, categories }: { cities: string[]; categories: string[] }) {
  const router = useRouter();
  const [city, setCity] = useState(cities[0] ?? "Medellín");
  const [category, setCategory] = useState(categories[0] ?? "Restaurantes");
  const [maxResults, setMaxResults] = useState(10);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setRunning(true);
        setError(null);
        const result = await postJson("/api/apify/run", { city, category, maxResults });
        setRunning(false);
        if (!result.ok) setError(result.error ?? "Error");
        router.refresh();
      }}
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Ciudad</label>
        <select className="input w-auto" value={city} onChange={(e) => setCity(e.target.value)}>
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Categoría</label>
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Máx. resultados</label>
        <input
          type="number"
          min={1}
          max={100}
          className="input w-24"
          value={maxResults}
          onChange={(e) => setMaxResults(Number(e.target.value))}
        />
      </div>
      <button className="btn-primary" disabled={running}>
        {running ? "Buscando…" : "Buscar leads"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

const CAMPAIGN_TYPES = [
  { value: "CAPTACION_OPT_IN", label: "Captación con opt-in" },
  { value: "SEGUIMIENTO", label: "Seguimiento (solo opt-in)" },
  { value: "REACTIVACION", label: "Reactivación" },
  { value: "POR_SERVICIO", label: "Por servicio" },
];

const CAMPAIGN_CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp (exige opt-in)" },
  { value: "EMAIL", label: "Email" },
  { value: "LANDING", label: "Landing" },
  { value: "QR", label: "Código QR" },
  { value: "ANUNCIO", label: "Anuncio" },
];

export function CampaignForm({
  templates,
}: {
  templates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("SEGUIMIENTO");
  const [channel, setChannel] = useState("WHATSAPP");
  const [dailyLimit, setDailyLimit] = useState(20);
  const [scoreMin, setScoreMin] = useState(61);
  const [templateId, setTemplateId] = useState("");

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Nueva campaña
      </button>
    );
  }

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await postJson("/api/campaigns", {
          name,
          type,
          channel,
          dailyLimit,
          templateId: templateId || undefined,
          audienceFilter: { scoreMin },
        });
        setOpen(false);
        setName("");
        router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Canal</label>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CAMPAIGN_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Límite diario</label>
          <input
            type="number" min={1} max={200} className="input"
            value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Score mínimo</label>
          <input
            type="number" min={0} max={100} className="input"
            value={scoreMin} onChange={(e) => setScoreMin(Number(e.target.value))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Plantilla</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">— Sin plantilla —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        ⚠ Las campañas de WhatsApp solo envían a leads con opt-in registrado. Los demás quedan
        bloqueados con la razón visible en el detalle de la campaña.
      </p>
      <div className="flex gap-2">
        <button className="btn-primary text-sm">Crear campaña</button>
        <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function SettingsForm({ initial }: { initial: Record<string, unknown> }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState({
    dailyLimit: Number(initial["whatsapp.dailyLimit"] ?? 50),
    hourlyLimit: Number(initial["whatsapp.hourlyLimit"] ?? 10),
    hoursStart: Number(initial["whatsapp.allowedHoursStart"] ?? 8),
    hoursEnd: Number(initial["whatsapp.allowedHoursEnd"] ?? 19),
    maxLeadsPerDay: Number(initial["leadHunter.maxLeadsPerDay"] ?? 60),
    minRating: Number(initial["leadHunter.minRating"] ?? 3.8),
    autoReply: Boolean(initial["ai.autoReplyEnabled"] ?? true),
    escalationScore: Number(initial["ai.escalationScoreThreshold"] ?? 80),
  });

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "whatsapp.dailyLimit": values.dailyLimit,
            "whatsapp.hourlyLimit": values.hourlyLimit,
            "whatsapp.allowedHoursStart": values.hoursStart,
            "whatsapp.allowedHoursEnd": values.hoursEnd,
            "leadHunter.maxLeadsPerDay": values.maxLeadsPerDay,
            "leadHunter.minRating": values.minRating,
            "ai.autoReplyEnabled": values.autoReply,
            "ai.escalationScoreThreshold": values.escalationScore,
          }),
        });
        setSaved(true);
        router.refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Límite diario WhatsApp</span>
          <input type="number" className="input" value={values.dailyLimit}
            onChange={(e) => set("dailyLimit", Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Límite por hora</span>
          <input type="number" className="input" value={values.hourlyLimit}
            onChange={(e) => set("hourlyLimit", Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Hora inicio envíos</span>
          <input type="number" min={0} max={23} className="input" value={values.hoursStart}
            onChange={(e) => set("hoursStart", Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Hora fin envíos</span>
          <input type="number" min={0} max={23} className="input" value={values.hoursEnd}
            onChange={(e) => set("hoursEnd", Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Máx. leads por día (Hunter)</span>
          <input type="number" className="input" value={values.maxLeadsPerDay}
            onChange={(e) => set("maxLeadsPerDay", Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Rating mínimo</span>
          <input type="number" step={0.1} className="input" value={values.minRating}
            onChange={(e) => set("minRating", Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Score de escalamiento</span>
          <input type="number" min={0} max={100} className="input" value={values.escalationScore}
            onChange={(e) => set("escalationScore", Number(e.target.value))} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={values.autoReply}
            onChange={(e) => set("autoReply", e.target.checked)} />
          <span>Respuesta automática de IA</span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary">Guardar cambios</button>
        {saved && <span className="text-sm text-emerald-600">✓ Guardado</span>}
      </div>
    </form>
  );
}
