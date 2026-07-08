import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { runLeadHunter, enrichLead } from "@/lib/apify";
import { prepareCampaignRecipients, processCampaignSends } from "@/lib/campaign-engine";

/**
 * Jobs programados. Se invocan vía POST /api/jobs/[job] (protegido con CRON_SECRET)
 * o manualmente con `npm run job -- <nombre>`.
 */

export const JOB_NAMES = [
  "lead-discovery",
  "lead-enrichment",
  "campaign-preparation",
  "follow-up",
  "daily-report",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export async function runJob(name: JobName): Promise<Record<string, unknown>> {
  await audit({ action: `job.${name}.started` });
  try {
    const result = await JOBS[name]();
    await audit({
      action: `job.${name}.completed`,
      detail: JSON.parse(JSON.stringify(result)),
    });
    return result;
  } catch (err) {
    await audit({ action: `job.${name}.failed`, level: "error", detail: { error: String(err) } });
    throw err;
  }
}

const JOBS: Record<JobName, () => Promise<Record<string, unknown>>> = {
  /** Job 1: descubre leads nuevos con Apify por ciudad/categoría rotativa. */
  "lead-discovery": async () => {
    const enabled = await getSetting("leadHunter.enabled");
    if (!enabled) return { skipped: true, reason: "leadHunter.enabled = false" };

    const cities = await getSetting("leadHunter.cities");
    const categories = await getSetting("leadHunter.categories");
    const maxPerDay = await getSetting("leadHunter.maxLeadsPerDay");

    // Rotación determinista: cada día toca una combinación distinta
    const dayIndex = Math.floor(Date.now() / 86400000);
    const city = cities[dayIndex % cities.length];
    const category = categories[dayIndex % categories.length];

    const run = await runLeadHunter({
      city,
      category,
      maxResults: Math.min(maxPerDay, 30),
    });
    return { runId: run.id, city, category, newLeads: run.newLeads, duplicates: run.duplicates };
  },

  /** Job 2: enriquece los leads que aún no tienen score/recomendación. */
  "lead-enrichment": async () => {
    const pending = await db.lead.findMany({
      where: { enrichedAt: null, status: { notIn: ["OPT_OUT", "NO_CONTACTAR"] } },
      take: 100,
      select: { id: true },
    });
    for (const lead of pending) await enrichLead(lead.id);
    return { enriched: pending.length };
  },

  /** Job 3: prepara audiencias y procesa envíos de campañas activas. */
  "campaign-preparation": async () => {
    const campaigns = await db.campaign.findMany({ where: { status: "ACTIVA" } });
    let prepared = 0;
    for (const campaign of campaigns) {
      const result = await prepareCampaignRecipients(campaign);
      prepared += result.added;
    }
    const sends = await processCampaignSends();
    return { campaigns: campaigns.length, prepared, sends };
  },

  /** Job 4: revisa conversaciones abiertas y crea tareas de seguimiento. */
  "follow-up": async () => {
    const threshold = new Date(Date.now() - 48 * 3600 * 1000);
    const stale = await db.conversation.findMany({
      where: {
        status: { in: ["ABIERTA", "PENDIENTE_HUMANO"] },
        lastMessageAt: { lt: threshold },
        lead: { status: { notIn: ["OPT_OUT", "NO_CONTACTAR", "GANADO", "PERDIDO"] } },
      },
      include: { lead: true },
      take: 50,
    });
    let tasksCreated = 0;
    for (const conv of stale) {
      const existing = await db.task.findFirst({
        where: {
          leadId: conv.leadId,
          status: "PENDIENTE",
          title: { startsWith: "Seguimiento:" },
        },
      });
      if (existing) continue;
      await db.task.create({
        data: {
          leadId: conv.leadId,
          title: `Seguimiento: ${conv.lead.companyName}`,
          description: `Conversación sin actividad desde ${conv.lastMessageAt?.toISOString().slice(0, 10)}. Próximo paso sugerido: ${conv.nextAction ?? "retomar conversación"}.`,
          dueDate: new Date(),
          status: "PENDIENTE",
        },
      });
      await db.conversation.update({
        where: { id: conv.id },
        data: { nextAction: conv.nextAction ?? "Retomar conversación (seguimiento)" },
      });
      tasksCreated++;
    }
    // Leads de alto score sin contactar → alerta
    const hotUncontacted = await db.lead.count({
      where: { score: { gte: 80 }, status: { in: ["CALIFICADO", "ENRIQUECIDO"] } },
    });
    if (hotUncontacted > 0) {
      await audit({
        action: "alert.high_score_uncontacted",
        level: "warn",
        detail: { count: hotUncontacted },
      });
    }
    return { staleConversations: stale.length, tasksCreated, hotUncontacted };
  },

  /** Job 5: genera el resumen diario (persistido en auditoría y visible en Reportes). */
  "daily-report": async () => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [newLeads, enriched, qualified, hotLeads, withConsent, messagesSent, responses, activeConversations, meetings, wonToday] =
      await Promise.all([
        db.lead.count({ where: { createdAt: { gte: dayStart } } }),
        db.lead.count({ where: { enrichedAt: { gte: dayStart } } }),
        db.lead.count({ where: { createdAt: { gte: dayStart }, score: { gte: 31 } } }),
        db.lead.count({ where: { score: { gte: 81 }, status: { notIn: ["GANADO", "PERDIDO", "OPT_OUT"] } } }),
        db.lead.count({ where: { consentStatus: "OPT_IN" } }),
        db.message.count({ where: { direction: "SALIENTE", createdAt: { gte: dayStart }, status: { not: "BLOQUEADO" } } }),
        db.message.count({ where: { direction: "ENTRANTE", createdAt: { gte: dayStart } } }),
        db.conversation.count({ where: { status: { in: ["ABIERTA", "PENDIENTE_HUMANO"] } } }),
        db.meeting.count({ where: { createdAt: { gte: dayStart } } }),
        db.opportunity.count({ where: { stage: "GANADA", updatedAt: { gte: dayStart } } }),
      ]);

    const report = {
      date: dayStart.toISOString().slice(0, 10),
      newLeads,
      enriched,
      qualified,
      hotLeads,
      withConsent,
      messagesSent,
      responses,
      activeConversations,
      meetings,
      wonToday,
    };
    await audit({ action: "report.daily", detail: report });
    return report;
  },
};
