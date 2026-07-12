import type { LeadStatus, ConsentStatus, LeadSourceType } from "@prisma/client";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NUEVO: "Nuevo lead",
  ENRIQUECIDO: "Enriquecido",
  CALIFICADO: "Calificado",
  PENDIENTE_CONSENTIMIENTO: "Pend. consentimiento",
  CONTACTO_PERMITIDO: "Contacto permitido",
  PRIMER_CONTACTO: "Primer contacto",
  RESPONDIO: "Respondió",
  CONVERSACION_ACTIVA: "Conversación activa",
  INTERESADO: "Interesado",
  DIAGNOSTICO_ENVIADO: "Diagnóstico enviado",
  REUNION_AGENDADA: "Reunión agendada",
  PROPUESTA_ENVIADA: "Propuesta enviada",
  NEGOCIACION: "Negociación",
  GANADO: "Ganado",
  PERDIDO: "Perdido",
  NO_CONTACTAR: "No contactar",
  OPT_OUT: "Opt-out",
};

export const CONSENT_LABELS: Record<ConsentStatus, string> = {
  SIN_CONSENTIMIENTO: "Sin consentimiento",
  PENDIENTE: "Pendiente",
  OPT_IN: "Opt-in ✓",
  OPT_OUT: "Opt-out ✕",
};

export const SOURCE_LABELS: Record<LeadSourceType, string> = {
  APIFY_GOOGLE_MAPS: "Google Maps (Apify)",
  LANDING_FORM: "Formulario landing",
  CLICK_TO_WHATSAPP: "Click-to-WhatsApp",
  WHATSAPP_INBOUND: "WhatsApp entrante",
  QR: "Código QR",
  ANUNCIO: "Anuncio",
  REFERIDO: "Referido",
  MANUAL: "Manual",
  CSV_IMPORT: "Importación CSV",
  LEAD_HUNTER: "Lead Hunter (IA)",
};

/** Orden de columnas del Kanban (etapas operativas del pipeline). */
export const PIPELINE_STAGES: LeadStatus[] = [
  "NUEVO",
  "ENRIQUECIDO",
  "CALIFICADO",
  "PENDIENTE_CONSENTIMIENTO",
  "CONTACTO_PERMITIDO",
  "PRIMER_CONTACTO",
  "RESPONDIO",
  "CONVERSACION_ACTIVA",
  "INTERESADO",
  "DIAGNOSTICO_ENVIADO",
  "REUNION_AGENDADA",
  "PROPUESTA_ENVIADA",
  "NEGOCIACION",
  "GANADO",
  "PERDIDO",
];

export function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(date));
}

export function scoreColor(score: number): string {
  if (score >= 81) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (score >= 61) return "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300";
  if (score >= 31) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

export function consentColor(status: ConsentStatus): string {
  switch (status) {
    case "OPT_IN":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "OPT_OUT":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    case "PENDIENTE":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
}
