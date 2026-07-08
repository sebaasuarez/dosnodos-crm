import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import type { Lead, Conversation } from "@prisma/client";

/**
 * Guard central de cumplimiento para WhatsApp.
 *
 * TODO envío saliente pasa por aquí. Un mensaje solo sale si:
 *  1. El lead NO está en opt-out / no contactar.
 *  2. Hay permiso: opt-in explícito, o el lead escribió primero (ventana de 24h).
 *  3. Está dentro del horario comercial permitido.
 *  4. No se superan los límites diario/horario globales.
 *  5. Se respeta la frecuencia máxima por lead (mensajes proactivos).
 *
 * Los mensajes de opt-out (confirmación de baja) están exentos de horario/límites.
 */

export type ComplianceResult =
  | { allowed: true; reason: "OPT_IN" | "SESSION_24H" | "OPT_OUT_CONFIRMATION" }
  | { allowed: false; code: ComplianceBlock; reason: string };

export type ComplianceBlock =
  | "OPT_OUT"
  | "NO_CONTACTAR"
  | "SIN_CONSENTIMIENTO"
  | "FUERA_DE_HORARIO"
  | "LIMITE_DIARIO"
  | "LIMITE_HORARIO"
  | "FRECUENCIA_EXCEDIDA"
  | "SIN_TELEFONO";

const BOGOTA_TZ = "America/Bogota";

export function bogotaHour(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BOGOTA_TZ,
      hour: "numeric",
      hour12: false,
    }).format(date),
  );
}

function within24hWindow(conversation?: Conversation | null): boolean {
  if (!conversation?.lastInboundAt) return false;
  return Date.now() - conversation.lastInboundAt.getTime() < 24 * 3600 * 1000;
}

export async function checkCanSendWhatsApp(
  lead: Lead,
  options: {
    conversation?: Conversation | null;
    isOptOutConfirmation?: boolean;
    isProactive?: boolean; // campañas y seguimientos (no respuestas a mensajes entrantes)
  } = {},
): Promise<ComplianceResult> {
  // 1. Bloqueos absolutos — se aplican incluso a respuestas
  if (lead.consentStatus === "OPT_OUT" || lead.status === "OPT_OUT") {
    if (options.isOptOutConfirmation) {
      return { allowed: true, reason: "OPT_OUT_CONFIRMATION" };
    }
    return { allowed: false, code: "OPT_OUT", reason: "El lead pidió no ser contactado (opt-out)." };
  }
  if (lead.status === "NO_CONTACTAR") {
    return { allowed: false, code: "NO_CONTACTAR", reason: "El lead está en la lista de no contactar." };
  }
  if (!lead.phone) {
    return { allowed: false, code: "SIN_TELEFONO", reason: "El lead no tiene teléfono registrado." };
  }

  // 2. Permiso de contacto
  const hasOptIn = lead.consentStatus === "OPT_IN";
  const hasOpenSession = within24hWindow(options.conversation);
  if (!hasOptIn && !hasOpenSession) {
    return {
      allowed: false,
      code: "SIN_CONSENTIMIENTO",
      reason:
        "El lead no tiene opt-in ni conversación abierta en las últimas 24h. " +
        "Debe pasar primero por un canal de captación permitido (landing, email, QR, click-to-WhatsApp).",
    };
  }

  // 3. Respuestas dentro de la ventana de 24h: permitidas sin más restricciones
  if (!options.isProactive && hasOpenSession) {
    return { allowed: true, reason: "SESSION_24H" };
  }

  // 4. Mensajes proactivos: horario, límites y frecuencia
  const hourStart = await getSetting("whatsapp.allowedHoursStart");
  const hourEnd = await getSetting("whatsapp.allowedHoursEnd");
  const hour = bogotaHour();
  if (hour < hourStart || hour >= hourEnd) {
    return {
      allowed: false,
      code: "FUERA_DE_HORARIO",
      reason: `Fuera del horario permitido (${hourStart}:00–${hourEnd}:00 hora Colombia).`,
    };
  }

  const [dailyLimit, hourlyLimit, minHoursBetween] = await Promise.all([
    getSetting("whatsapp.dailyLimit"),
    getSetting("whatsapp.hourlyLimit"),
    getSetting("whatsapp.minHoursBetweenMessages"),
  ]);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3600 * 1000);

  const [sentToday, sentLastHour, lastProactive] = await Promise.all([
    db.message.count({
      where: { direction: "SALIENTE", createdAt: { gte: dayStart }, status: { not: "BLOQUEADO" } },
    }),
    db.message.count({
      where: { direction: "SALIENTE", createdAt: { gte: hourAgo }, status: { not: "BLOQUEADO" } },
    }),
    db.message.findFirst({
      where: { leadId: lead.id, direction: "SALIENTE", status: { not: "BLOQUEADO" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (sentToday >= dailyLimit) {
    return { allowed: false, code: "LIMITE_DIARIO", reason: `Límite diario global alcanzado (${dailyLimit}).` };
  }
  if (sentLastHour >= hourlyLimit) {
    return { allowed: false, code: "LIMITE_HORARIO", reason: `Límite por hora alcanzado (${hourlyLimit}).` };
  }
  if (
    lastProactive &&
    Date.now() - lastProactive.createdAt.getTime() < minHoursBetween * 3600 * 1000
  ) {
    return {
      allowed: false,
      code: "FRECUENCIA_EXCEDIDA",
      reason: `Ya se le envió un mensaje hace menos de ${minHoursBetween}h.`,
    };
  }

  return { allowed: true, reason: hasOptIn ? "OPT_IN" : "SESSION_24H" };
}

/** Registra en auditoría un mensaje bloqueado por el guard. */
export async function logBlockedMessage(
  lead: Lead,
  result: Extract<ComplianceResult, { allowed: false }>,
  context: string,
) {
  await audit({
    action: "message.blocked",
    entity: "lead",
    entityId: lead.id,
    level: "warn",
    detail: { code: result.code, reason: result.reason, context, company: lead.companyName },
  });
}

/** Procesa un opt-out: marca el lead, registra evidencia y audita. */
export async function processOptOut(leadId: string, channel: string, evidence: string) {
  const now = new Date();
  await db.$transaction([
    db.lead.update({
      where: { id: leadId },
      data: { consentStatus: "OPT_OUT", status: "OPT_OUT", optOutDate: now },
    }),
    db.consentEvent.create({
      data: { leadId, type: "OPT_OUT", channel, evidence, source: "mensaje entrante" },
    }),
  ]);
  await audit({
    action: "lead.opt_out",
    entity: "lead",
    entityId: leadId,
    detail: { channel, evidence },
  });
}

/** Registra un opt-in con trazabilidad completa. */
export async function processOptIn(
  leadId: string,
  channel: string,
  source: string,
  evidence?: string,
) {
  const now = new Date();
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  // Un opt-out previo no se revierte automáticamente: exige revisión humana
  if (lead.consentStatus === "OPT_OUT") {
    await audit({
      action: "lead.opt_in.rejected",
      entity: "lead",
      entityId: leadId,
      level: "warn",
      detail: { reason: "Lead con opt-out previo; requiere revisión manual." },
    });
    return { ok: false as const, reason: "Lead con opt-out previo. Revisión manual requerida." };
  }
  await db.$transaction([
    db.lead.update({
      where: { id: leadId },
      data: {
        consentStatus: "OPT_IN",
        optInDate: now,
        status: lead.status === "NUEVO" || lead.status === "ENRIQUECIDO" || lead.status === "CALIFICADO" || lead.status === "PENDIENTE_CONSENTIMIENTO"
          ? "CONTACTO_PERMITIDO"
          : lead.status,
      },
    }),
    db.consentEvent.create({
      data: { leadId, type: "OPT_IN", channel, source, evidence },
    }),
  ]);
  await audit({ action: "lead.opt_in", entity: "lead", entityId: leadId, detail: { channel, source } });
  return { ok: true as const };
}
