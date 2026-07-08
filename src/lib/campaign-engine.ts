import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkCanSendWhatsApp, logBlockedMessage } from "@/lib/compliance";
import { sendWhatsAppText, renderTemplate } from "@/lib/kapso";
import type { Campaign, Prisma } from "@prisma/client";

/**
 * Motor de campañas.
 *
 * - Selecciona la audiencia según el filtro configurado.
 * - SOLO agrega destinatarios de WhatsApp con consentimiento OPT_IN.
 *   Los leads sin consentimiento se marcan como BLOQUEADO con razón visible
 *   (para campañas de captación deben usarse canales email/landing/QR).
 * - El envío respeta límites por campaña Y los límites globales del guard.
 */

type AudienceFilter = {
  cities?: string[];
  categories?: string[];
  scoreMin?: number;
  statuses?: string[];
};

export async function prepareCampaignRecipients(campaign: Campaign) {
  const filter = (campaign.audienceFilter ?? {}) as AudienceFilter;
  const where: Prisma.LeadWhereInput = {
    ...(filter.cities?.length ? { city: { in: filter.cities } } : {}),
    ...(filter.categories?.length ? { category: { in: filter.categories } } : {}),
    ...(filter.scoreMin ? { score: { gte: filter.scoreMin } } : {}),
    status: { notIn: ["OPT_OUT", "NO_CONTACTAR", "GANADO", "PERDIDO"] },
  };

  const leads = await db.lead.findMany({ where, take: 500 });
  let added = 0;
  let blocked = 0;

  for (const lead of leads) {
    const existing = await db.campaignRecipient.findUnique({
      where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
    });
    if (existing) continue;

    // Campañas por WhatsApp exigen opt-in explícito
    if (campaign.channel === "WHATSAPP" && lead.consentStatus !== "OPT_IN") {
      await db.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          leadId: lead.id,
          status: "BLOQUEADO",
          blockedReason: "Sin opt-in de WhatsApp. Usar canal de captación (email/landing/QR) primero.",
        },
      });
      blocked++;
      continue;
    }

    await db.campaignRecipient.create({
      data: { campaignId: campaign.id, leadId: lead.id, status: "PENDIENTE" },
    });
    added++;
  }

  await audit({
    action: "campaign.prepared",
    entity: "campaign",
    entityId: campaign.id,
    detail: { added, blocked, total: leads.length },
  });
  return { added, blocked };
}

/**
 * Procesa una tanda de envíos para las campañas activas de WhatsApp.
 * Respeta: límite diario/horario por campaña, horario de la campaña
 * y todas las reglas del guard global.
 */
export async function processCampaignSends(options: { maxPerRun?: number } = {}) {
  const campaigns = await db.campaign.findMany({
    where: { status: "ACTIVA", channel: "WHATSAPP" },
    include: { template: true },
  });

  const results: { campaignId: string; sent: number; blocked: number }[] = [];

  for (const campaign of campaigns) {
    let sent = 0;
    let blocked = 0;

    // Límite diario de la campaña
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = await db.campaignRecipient.count({
      where: { campaignId: campaign.id, sentAt: { gte: dayStart } },
    });
    const remainingToday = Math.max(0, campaign.dailyLimit - sentToday);
    if (remainingToday === 0) {
      results.push({ campaignId: campaign.id, sent: 0, blocked: 0 });
      continue;
    }

    const batchSize = Math.min(
      remainingToday,
      campaign.hourlyLimit,
      options.maxPerRun ?? 10,
    );

    const pending = await db.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: "PENDIENTE" },
      include: { lead: true },
      take: batchSize,
    });

    for (const recipient of pending) {
      const lead = recipient.lead;
      const conversation = await db.conversation.findFirst({
        where: { leadId: lead.id },
        orderBy: { createdAt: "desc" },
      });

      const check = await checkCanSendWhatsApp(lead, { conversation, isProactive: true });
      if (!check.allowed) {
        await logBlockedMessage(lead, check, `campaign:${campaign.id}`);
        await db.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "BLOQUEADO", blockedReason: `${check.code}: ${check.reason}` },
        });
        blocked++;
        continue;
      }

      const body = campaign.template
        ? renderTemplate(campaign.template.body, {
            nombre: lead.contactName ?? lead.companyName,
            negocio: lead.companyName,
            servicio_recomendado: lead.recommendedService ?? "mejorar tu presencia digital",
          })
        : `Hola ${lead.contactName ?? ""} 👋 Soy el asistente de Dos Nodos.`;

      const result = await sendWhatsAppText(lead.phone!, body);

      // Registrar mensaje en la conversación (crearla si no existe)
      const conv =
        conversation ??
        (await db.conversation.create({
          data: { leadId: lead.id, status: "ABIERTA", lastMessageAt: new Date() },
        }));
      await db.message.create({
        data: {
          conversationId: conv.id,
          leadId: lead.id,
          direction: "SALIENTE",
          content: body,
          messageType: campaign.template ? "template" : "text",
          templateName: campaign.template?.name,
          providerMessageId: result.providerMessageId,
          status: result.ok ? "ENVIADO" : "FALLIDO",
          failedReason: result.ok ? null : result.error,
          sentAt: result.ok ? new Date() : null,
        },
      });

      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: result.ok ? "ENVIADO" : "ERROR",
          sentAt: result.ok ? new Date() : null,
          blockedReason: result.ok ? null : result.error,
        },
      });

      if (result.ok && ["CONTACTO_PERMITIDO", "CALIFICADO", "ENRIQUECIDO", "NUEVO"].includes(lead.status)) {
        await db.lead.update({
          where: { id: lead.id },
          data: { status: "PRIMER_CONTACTO", lastInteraction: new Date() },
        });
      }
      if (result.ok) sent++;
      else blocked++;
    }

    results.push({ campaignId: campaign.id, sent, blocked });
    if (sent + blocked > 0) {
      await audit({
        action: "campaign.batch_processed",
        entity: "campaign",
        entityId: campaign.id,
        detail: { sent, blocked },
      });
    }
  }

  return results;
}
