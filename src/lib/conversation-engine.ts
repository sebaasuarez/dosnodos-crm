import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { checkCanSendWhatsApp, logBlockedMessage, processOptOut, processOptIn } from "@/lib/compliance";
import { sendWhatsAppText } from "@/lib/kapso";
import { generateReply, summarizeConversation } from "@/lib/ai";
import { detectIntent, HOT_INTENTS, ESCALATION_INTENTS } from "@/lib/intents";
import type { Lead, Conversation } from "@prisma/client";

/**
 * Motor de conversaciones: procesa cada mensaje entrante de WhatsApp.
 *
 * Pipeline:
 *  1. Encontrar o crear el lead por teléfono (mensaje entrante = opt-in implícito:
 *     la persona escribió primero → contacto permitido con trazabilidad).
 *  2. Encontrar o crear la conversación y registrar el mensaje.
 *  3. Detectar intención. Opt-out y escalamiento se resuelven por reglas SIEMPRE.
 *  4. Si la IA está habilitada para la conversación, responder automáticamente
 *     (pasando por el guard de cumplimiento).
 *  5. Actualizar etapa del CRM, marcar leads calientes, crear oportunidades.
 */

export type InboundMessage = {
  phone: string;
  text: string;
  providerMessageId?: string;
  kapsoConversationId?: string;
  contactName?: string;
};

export async function processInboundMessage(input: InboundMessage) {
  // 1. Lead por teléfono
  let lead = await db.lead.findFirst({ where: { phone: input.phone } });
  const isNewLead = !lead;
  if (!lead) {
    lead = await db.lead.create({
      data: {
        companyName: input.contactName ?? `WhatsApp ${input.phone}`,
        contactName: input.contactName,
        phone: input.phone,
        hasWhatsapp: true,
        source: "WHATSAPP_INBOUND",
        status: "RESPONDIO",
        consentStatus: "OPT_IN", // escribió primero: consentimiento por iniciativa propia
        optInDate: new Date(),
      },
    });
    await db.consentEvent.create({
      data: {
        leadId: lead.id,
        type: "OPT_IN",
        channel: "whatsapp",
        source: "mensaje entrante espontáneo",
        evidence: input.text.slice(0, 500),
      },
    });
    await audit({ action: "lead.created.inbound", entity: "lead", entityId: lead.id });
  } else if (lead.consentStatus === "SIN_CONSENTIMIENTO" || lead.consentStatus === "PENDIENTE") {
    // Lead prospectado que ahora escribe: registrar opt-in con evidencia
    await processOptIn(lead.id, "whatsapp", "el lead escribió primero", input.text.slice(0, 500));
    lead = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
  }

  // 2. Conversación + registro del mensaje entrante
  let conversation = await db.conversation.findFirst({
    where: {
      leadId: lead.id,
      ...(input.kapsoConversationId ? {} : { status: { not: "CERRADA" } }),
    },
    orderBy: { createdAt: "desc" },
  });
  if (input.kapsoConversationId) {
    conversation =
      (await db.conversation.findUnique({
        where: { kapsoConversationId: input.kapsoConversationId },
      })) ?? conversation;
  }
  const now = new Date();
  if (!conversation || conversation.status === "CERRADA") {
    conversation = await db.conversation.create({
      data: {
        leadId: lead.id,
        kapsoConversationId: input.kapsoConversationId,
        status: "ABIERTA",
        lastMessageAt: now,
        lastInboundAt: now,
      },
    });
  } else {
    conversation = await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        lastInboundAt: now,
        ...(input.kapsoConversationId && !conversation.kapsoConversationId
          ? { kapsoConversationId: input.kapsoConversationId }
          : {}),
      },
    });
  }

  const intent = detectIntent(input.text);
  await db.message.create({
    data: {
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "ENTRANTE",
      content: input.text,
      providerMessageId: input.providerMessageId,
      status: "ENTREGADO",
      detectedIntent: intent,
    },
  });

  // Etapa CRM: al responder, el lead avanza
  if (["NUEVO", "ENRIQUECIDO", "CALIFICADO", "CONTACTO_PERMITIDO", "PRIMER_CONTACTO", "PENDIENTE_CONSENTIMIENTO"].includes(lead.status)) {
    lead = await db.lead.update({
      where: { id: lead.id },
      data: { status: "RESPONDIO", lastInteraction: now },
    });
  } else {
    lead = await db.lead.update({
      where: { id: lead.id },
      data: { lastInteraction: now, status: lead.status === "RESPONDIO" ? "CONVERSACION_ACTIVA" : lead.status },
    });
  }

  // 3. Reglas duras primero
  if (intent === "OPT_OUT") {
    await processOptOut(lead.id, "whatsapp", input.text.slice(0, 500));
    const optOutReply = `Entendido${lead.contactName ? `, ${lead.contactName}` : ""}. No volveremos a contactarte por este medio. Gracias por tu tiempo.`;
    await sendReply(lead, conversation, optOutReply, { isOptOutConfirmation: true, sentByAi: true, intent });
    await db.conversation.update({ where: { id: conversation.id }, data: { status: "CERRADA", nextAction: "Ninguna — opt-out" } });
    return { handled: "opt_out" as const, leadId: lead.id };
  }

  if (ESCALATION_INTENTS.includes(intent)) {
    await escalateToHuman(lead, conversation, `Intención detectada: ${intent}`);
    if (intent === "QUIERE_HUMANO") {
      const reply = `Perfecto${lead.contactName ? `, ${lead.contactName}` : ""}. Voy a pasar tu caso a una persona del equipo para que te acompañe mejor.`;
      await sendReply(lead, conversation, reply, { sentByAi: true, intent });
    }
    return { handled: "escalated" as const, leadId: lead.id };
  }

  // 4. Lead caliente → oportunidad + notificación interna
  if (HOT_INTENTS.includes(intent)) {
    await markLeadHot(lead, conversation, intent);
    lead = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
  }

  // 5. Respuesta automática (si la IA está activa para esta conversación)
  const autoReplyEnabled = await getSetting("ai.autoReplyEnabled");
  if (!autoReplyEnabled || !conversation.aiEnabled || conversation.status === "PENDIENTE_HUMANO") {
    return { handled: "stored" as const, leadId: lead.id };
  }

  const history = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { direction: true, content: true },
  });
  const reply = await generateReply(lead, history.slice(0, -1), input.text);
  await sendReply(lead, conversation, reply.text, { sentByAi: true, intent: reply.intent });

  // Escalamiento por score alto + intención de compra
  const escalationThreshold = await getSetting("ai.escalationScoreThreshold");
  if (lead.score >= escalationThreshold && HOT_INTENTS.includes(intent)) {
    await escalateToHuman(lead, conversation, `Score ${lead.score} + intención ${intent}`);
  }

  // Resumen para el CRM (best effort)
  const summary = await summarizeConversation(lead, history);
  if (summary) {
    await db.conversation.update({ where: { id: conversation.id }, data: { aiSummary: summary } });
  }

  return { handled: "replied" as const, leadId: lead.id, isNewLead };
}

/** Envía una respuesta pasando por el guard de cumplimiento y la registra. */
export async function sendReply(
  lead: Lead,
  conversation: Conversation,
  text: string,
  meta: { sentByAi?: boolean; intent?: string; isOptOutConfirmation?: boolean; isProactive?: boolean } = {},
) {
  const check = await checkCanSendWhatsApp(lead, {
    conversation,
    isOptOutConfirmation: meta.isOptOutConfirmation,
    isProactive: meta.isProactive ?? false,
  });

  if (!check.allowed) {
    await logBlockedMessage(lead, check, "conversation-engine");
    await db.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        direction: "SALIENTE",
        content: text,
        status: "BLOQUEADO",
        failedReason: `${check.code}: ${check.reason}`,
        sentByAi: meta.sentByAi ?? false,
      },
    });
    return { sent: false as const, reason: check.reason };
  }

  const result = await sendWhatsAppText(lead.phone!, text);
  await db.message.create({
    data: {
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "SALIENTE",
      content: text,
      providerMessageId: result.providerMessageId,
      status: result.ok ? "ENVIADO" : "FALLIDO",
      failedReason: result.ok ? null : result.error,
      sentByAi: meta.sentByAi ?? false,
      sentAt: result.ok ? new Date() : null,
      detectedIntent: meta.intent,
    },
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  return { sent: result.ok, reason: result.error };
}

async function escalateToHuman(lead: Lead, conversation: Conversation, reason: string) {
  await db.conversation.update({
    where: { id: conversation.id },
    data: { status: "PENDIENTE_HUMANO", aiEnabled: false, nextAction: `Atender: ${reason}` },
  });
  await db.task.create({
    data: {
      leadId: lead.id,
      title: `Atender conversación de ${lead.companyName}`,
      description: reason,
      dueDate: new Date(),
      status: "PENDIENTE",
    },
  });
  await audit({
    action: "conversation.escalated",
    entity: "conversation",
    entityId: conversation.id,
    level: "warn",
    detail: { leadId: lead.id, reason },
  });
}

async function markLeadHot(lead: Lead, conversation: Conversation, intent: string) {
  const hasOpportunity = await db.opportunity.findFirst({
    where: { leadId: lead.id, stage: { notIn: ["GANADA", "PERDIDA"] } },
  });
  if (!hasOpportunity) {
    await db.opportunity.create({
      data: {
        leadId: lead.id,
        service: lead.recommendedService ?? "Por definir",
        packageName: lead.recommendedPackage,
        stage: "DIAGNOSTICO",
        probability: 40,
        notes: `Creada automáticamente por intención: ${intent}`,
      },
    });
  }
  if (!["INTERESADO", "DIAGNOSTICO_ENVIADO", "REUNION_AGENDADA", "PROPUESTA_ENVIADA", "NEGOCIACION", "GANADO"].includes(lead.status)) {
    await db.lead.update({
      where: { id: lead.id },
      data: { status: "INTERESADO", nextStep: "Ofrecer diagnóstico o llamada corta" },
    });
  }
  await db.conversation.update({
    where: { id: conversation.id },
    data: { nextAction: "Lead caliente: proponer reunión de 15 min" },
  });
  await audit({
    action: "lead.hot",
    entity: "lead",
    entityId: lead.id,
    detail: { intent, company: lead.companyName, score: lead.score },
  });
}
