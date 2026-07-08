import { db } from "@/lib/db";

/** Consultas agregadas para dashboard y reportes. */

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function dashboardSummary() {
  const today = daysAgo(0);
  const week = daysAgo(7);

  const [
    leadsToday, enrichedToday, qualifiedToday, highScore, pendingContact, withConsent,
    messagesSentToday, responsesToday, activeConversations, pendingHuman,
    meetingsScheduled, proposalsSent, wonTotal, pipelineValue, blockedToday,
    tasksToday, hotLeads,
  ] = await Promise.all([
    db.lead.count({ where: { createdAt: { gte: today } } }),
    db.lead.count({ where: { enrichedAt: { gte: today } } }),
    db.lead.count({ where: { createdAt: { gte: today }, score: { gte: 31 } } }),
    db.lead.count({ where: { score: { gte: 81 }, status: { notIn: ["GANADO", "PERDIDO", "OPT_OUT", "NO_CONTACTAR"] } } }),
    db.lead.count({ where: { consentStatus: "OPT_IN", status: "CONTACTO_PERMITIDO" } }),
    db.lead.count({ where: { consentStatus: "OPT_IN" } }),
    db.message.count({ where: { direction: "SALIENTE", createdAt: { gte: today }, status: { not: "BLOQUEADO" } } }),
    db.message.count({ where: { direction: "ENTRANTE", createdAt: { gte: today } } }),
    db.conversation.count({ where: { status: "ABIERTA" } }),
    db.conversation.count({ where: { status: "PENDIENTE_HUMANO" } }),
    db.meeting.count({ where: { scheduledAt: { gte: today }, status: { in: ["AGENDADA", "CONFIRMADA"] } } }),
    db.lead.count({ where: { status: "PROPUESTA_ENVIADA" } }),
    db.opportunity.count({ where: { stage: "GANADA" } }),
    db.opportunity.aggregate({
      where: { stage: { notIn: ["GANADA", "PERDIDA"] } },
      _sum: { estimatedValue: true },
    }),
    db.message.count({ where: { status: "BLOQUEADO", createdAt: { gte: today } } }),
    db.task.findMany({
      where: { status: "PENDIENTE", dueDate: { lte: new Date(new Date().setHours(23, 59, 59)) } },
      include: { lead: { select: { id: true, companyName: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.lead.findMany({
      where: { score: { gte: 61 }, status: { notIn: ["GANADO", "PERDIDO", "OPT_OUT", "NO_CONTACTAR"] } },
      orderBy: { score: "desc" },
      take: 8,
      select: {
        id: true, companyName: true, city: true, category: true, score: true,
        status: true, consentStatus: true, recommendedService: true,
      },
    }),
  ]);

  // Leads por día (últimos 14 días) para la gráfica
  const since = daysAgo(13);
  const recentLeads = await db.lead.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const perDay = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    perDay.set(daysAgo(i).toISOString().slice(0, 10), 0);
  }
  for (const lead of recentLeads) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  // Embudo por etapa
  const funnelRaw = await db.lead.groupBy({ by: ["status"], _count: { _all: true } });
  const funnel = Object.fromEntries(funnelRaw.map((f) => [f.status, f._count._all]));

  const weekResponses = await db.message.count({
    where: { direction: "ENTRANTE", createdAt: { gte: week } },
  });
  const weekSent = await db.message.count({
    where: { direction: "SALIENTE", createdAt: { gte: week }, status: { not: "BLOQUEADO" } },
  });

  return {
    daily: {
      leadsToday, enrichedToday, qualifiedToday, highScore, pendingContact,
      withConsent, messagesSentToday, responsesToday, activeConversations,
      pendingHuman, meetingsScheduled, proposalsSent, wonTotal,
      pipelineValue: pipelineValue._sum.estimatedValue ?? 0,
      blockedToday,
      responseRate: weekSent > 0 ? Math.round((weekResponses / weekSent) * 100) : 0,
    },
    leadsPerDay: [...perDay.entries()].map(([date, count]) => ({ date, count })),
    funnel,
    tasksToday,
    hotLeads,
  };
}

export async function weeklyReport() {
  const week = daysAgo(7);
  const [newLeads, byCity, byCategory, bySource, lost] = await Promise.all([
    db.lead.count({ where: { createdAt: { gte: week } } }),
    db.lead.groupBy({ by: ["city"], where: { createdAt: { gte: week } }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    db.lead.groupBy({ by: ["category"], where: { createdAt: { gte: week } }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    db.lead.groupBy({ by: ["source"], where: { createdAt: { gte: week } }, _count: { _all: true } }),
    db.lead.findMany({
      where: { status: "PERDIDO", updatedAt: { gte: week } },
      select: { companyName: true, lostReason: true },
      take: 20,
    }),
  ]);
  const byService = await db.lead.groupBy({
    by: ["recommendedService"],
    where: { createdAt: { gte: week }, recommendedService: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: 8,
  });
  return { newLeads, byCity, byCategory, bySource, byService, lost };
}

export async function monthlyReport() {
  const month = daysAgo(30);
  const [pipeline, won, lost, meetings, proposals, totalLeads] = await Promise.all([
    db.opportunity.aggregate({
      where: { stage: { notIn: ["GANADA", "PERDIDA"] } },
      _sum: { estimatedValue: true },
      _count: { _all: true },
    }),
    db.opportunity.aggregate({
      where: { stage: "GANADA", updatedAt: { gte: month } },
      _sum: { estimatedValue: true },
      _count: { _all: true },
    }),
    db.opportunity.count({ where: { stage: "PERDIDA", updatedAt: { gte: month } } }),
    db.meeting.count({ where: { createdAt: { gte: month } } }),
    db.lead.count({ where: { status: { in: ["PROPUESTA_ENVIADA", "NEGOCIACION"] } } }),
    db.lead.count({ where: { createdAt: { gte: month } } }),
  ]);
  const leadToMeeting = totalLeads > 0 ? Math.round((meetings / totalLeads) * 100) : 0;
  const meetingToProposal = meetings > 0 ? Math.round((proposals / meetings) * 100) : 0;
  const proposalToSale = proposals > 0 ? Math.round((won._count._all / proposals) * 100) : 0;
  return {
    totalLeads,
    pipelineCount: pipeline._count._all,
    pipelineValue: pipeline._sum.estimatedValue ?? 0,
    wonCount: won._count._all,
    wonValue: won._sum.estimatedValue ?? 0,
    lostCount: lost,
    meetings,
    proposals,
    conversion: { leadToMeeting, meetingToProposal, proposalToSale },
  };
}

/** Exporta leads a CSV. */
export async function leadsCsv(): Promise<string> {
  const leads = await db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
  const headers = [
    "empresa", "contacto", "telefono", "email", "sitio_web", "ciudad", "categoria",
    "fuente", "rating", "resenas", "score", "estado", "consentimiento",
    "servicio_recomendado", "creado",
  ];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map((l) =>
    [
      l.companyName, l.contactName, l.phone, l.email, l.website, l.city, l.category,
      l.source, l.rating, l.reviewsCount, l.score, l.status, l.consentStatus,
      l.recommendedService, l.createdAt.toISOString(),
    ].map(escape).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
