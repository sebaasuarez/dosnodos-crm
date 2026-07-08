import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Seed de datos para desarrollo y pruebas.
 * Crea usuarios, paquetes, plantillas y datos mock de leads/conversaciones
 * que cubren todos los estados del pipeline y de consentimiento.
 *
 * Usuarios (contraseña para todos: dosnodos2026):
 *  - admin@dosnodos.com.co     (ADMIN)
 *  - comercial@dosnodos.com.co (COMERCIAL)
 *  - marketing@dosnodos.com.co (MARKETING)
 *  - lectura@dosnodos.com.co   (LECTURA)
 */

const db = new PrismaClient();

async function main() {
  console.log("→ Seed: usuarios");
  const passwordHash = await bcrypt.hash("dosnodos2026", 10);
  const users = [
    { name: "Admin Dos Nodos", email: "admin@dosnodos.com.co", role: "ADMIN" as const },
    { name: "Comercial", email: "comercial@dosnodos.com.co", role: "COMERCIAL" as const },
    { name: "Marketing", email: "marketing@dosnodos.com.co", role: "MARKETING" as const },
    { name: "Solo Lectura", email: "lectura@dosnodos.com.co", role: "LECTURA" as const },
  ];
  for (const user of users) {
    await db.user.upsert({
      where: { email: user.email },
      create: { ...user, passwordHash },
      update: { role: user.role },
    });
  }
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@dosnodos.com.co" } });

  console.log("→ Seed: paquetes comerciales");
  const packages = [
    {
      name: "Presencia Digital Inicial",
      tagline: "Para negocios que no tienen web",
      features: ["Sitio web básico", "Botón WhatsApp", "Formulario de contacto", "Optimización básica", "Configuración Google Analytics"],
      idealFor: "Ideal para negocios que no tienen web.",
      priceMinCop: 900000, priceMaxCop: 1800000, sortOrder: 1,
    },
    {
      name: "Landing que Vende",
      tagline: "Para campañas y ventas por redes",
      features: ["Landing page comercial", "Copy de venta", "CTA a WhatsApp", "Formulario de prospectos", "Medición de conversiones"],
      idealFor: "Ideal para campañas o negocios que venden por redes.",
      priceMinCop: 700000, priceMaxCop: 1500000, sortOrder: 2,
    },
    {
      name: "WhatsApp Inteligente",
      tagline: "Para negocios que reciben muchos mensajes",
      features: ["Automatización de respuestas frecuentes", "Captura de datos", "Clasificación de clientes", "Escalamiento a humano", "Registro en CRM"],
      idealFor: "Ideal para negocios que reciben muchos mensajes.",
      priceMinCop: 1200000, priceMaxCop: 2500000, sortOrder: 3,
    },
    {
      name: "Automatización con IA",
      tagline: "Para empresas que quieren ahorrar tiempo",
      features: ["Análisis de proceso", "Automatización de tareas repetitivas", "Integración con herramientas", "Asistente IA personalizado"],
      idealFor: "Ideal para empresas que quieren ahorrar tiempo.",
      priceMinCop: 2000000, priceMaxCop: 6000000, sortOrder: 4,
    },
    {
      name: "Diagnóstico Digital",
      tagline: "Entrada gratuita o de bajo costo",
      features: ["Revisión de sitio/redes", "Revisión de WhatsApp", "Revisión de captación", "Recomendaciones rápidas", "Propuesta de mejora"],
      idealFor: "Ideal como entrada gratuita o de bajo costo.",
      priceMinCop: 0, priceMaxCop: 150000, sortOrder: 5,
    },
  ];
  for (const pkg of packages) {
    await db.servicePackage.upsert({
      where: { name: pkg.name },
      create: pkg,
      update: pkg,
    });
  }

  console.log("→ Seed: plantillas de WhatsApp");
  const templates = [
    {
      name: "bienvenida_landing",
      category: "UTILITY",
      body: "Hola {{nombre}}, soy el asistente de Dos Nodos 👋\nGracias por escribirnos. Vi que estás interesado en mejorar la presencia digital de tu negocio.\n¿Quieres que te haga unas preguntas rápidas para recomendarte la mejor opción?",
      variables: ["nombre"],
      status: "APROBADA" as const,
    },
    {
      name: "diagnostico_gratuito",
      category: "MARKETING",
      body: "Hola {{nombre}}, revisamos la información inicial de {{negocio}} y creemos que podríamos ayudarte con {{servicio_recomendado}}.\n¿Te gustaría recibir un diagnóstico corto y sin costo para ver oportunidades concretas?",
      variables: ["nombre", "negocio", "servicio_recomendado"],
      status: "APROBADA" as const,
    },
    {
      name: "seguimiento_conversacion",
      category: "MARKETING",
      body: "Hola {{nombre}} 👋\nQuería retomar nuestra conversación sobre {{servicio_recomendado}}.\nCon base en lo que nos contaste, el siguiente paso sería revisar tu negocio y proponerte una ruta simple.\n¿Te gustaría que agendemos una llamada corta?",
      variables: ["nombre", "servicio_recomendado"],
      status: "APROBADA" as const,
    },
    {
      name: "confirmacion_opt_out",
      category: "UTILITY",
      body: "Entendido, {{nombre}}. No volveremos a contactarte por este medio. Gracias por tu tiempo.",
      variables: ["nombre"],
      status: "APROBADA" as const,
    },
    {
      name: "escalamiento_humano",
      category: "UTILITY",
      body: "Perfecto, {{nombre}}. Voy a pasar tu caso a una persona del equipo para que te acompañe mejor.",
      variables: ["nombre"],
      status: "APROBADA" as const,
    },
    {
      name: "recordatorio_reunion",
      category: "UTILITY",
      body: "Hola {{nombre}}, te recordamos la llamada de {{negocio}} con Dos Nodos. ¡Nos vemos pronto!",
      variables: ["nombre", "negocio"],
      status: "PENDIENTE_APROBACION" as const,
    },
  ];
  for (const template of templates) {
    await db.whatsappTemplate.upsert({
      where: { name: template.name },
      create: template,
      update: { body: template.body, status: template.status },
    });
  }

  // ── Leads mock ──────────────────────────────────────────────────
  const existingLeads = await db.lead.count();
  if (existingLeads > 0) {
    console.log(`→ Ya existen ${existingLeads} leads; se omite el seed de leads mock.`);
    return;
  }

  console.log("→ Seed: leads mock (todos los estados del pipeline)");

  type MockLead = {
    companyName: string; contactName?: string; city: string; category: string;
    phone?: string; email?: string; website?: string; rating?: number; reviewsCount?: number;
    hasSocialMedia?: boolean;
    status: string; consentStatus: string; score: number;
    recommendedService?: string; recommendedPackage?: string;
    source?: string; daysAgo?: number;
  };

  const mockLeads: MockLead[] = [
    // Capturados por Apify, sin consentimiento (pipeline temprano)
    { companyName: "Restaurante El Fogón Paisa", city: "Medellín", category: "Restaurantes", phone: "+573001112201", rating: 4.5, reviewsCount: 230, status: "CALIFICADO", consentStatus: "SIN_CONSENTIMIENTO", score: 80, recommendedService: "SEO local + página de presencia digital", recommendedPackage: "Presencia Digital Inicial", source: "APIFY_GOOGLE_MAPS", daysAgo: 1 },
    { companyName: "Barbería Estilo Urbano", city: "Envigado", category: "Barberías", phone: "+573001112202", rating: 4.8, reviewsCount: 89, hasSocialMedia: true, status: "CALIFICADO", consentStatus: "SIN_CONSENTIMIENTO", score: 85, recommendedService: "Automatización de agenda + recordatorios", recommendedPackage: "Automatización con IA", source: "APIFY_GOOGLE_MAPS", daysAgo: 1 },
    { companyName: "Café La Toma", city: "Medellín", category: "Cafés", phone: "+573001112203", rating: 4.3, reviewsCount: 45, status: "ENRIQUECIDO", consentStatus: "SIN_CONSENTIMIENTO", score: 70, recommendedService: "Sitio web profesional + WhatsApp conectado", recommendedPackage: "Presencia Digital Inicial", source: "APIFY_GOOGLE_MAPS", daysAgo: 2 },
    { companyName: "Gimnasio Fuerza Total", city: "Itagüí", category: "Gimnasios", phone: "+573001112204", website: "https://fuerzatotal.negocio.site", rating: 4.1, reviewsCount: 120, status: "NUEVO", consentStatus: "SIN_CONSENTIMIENTO", score: 65, source: "APIFY_GOOGLE_MAPS", daysAgo: 0 },
    { companyName: "Veterinaria Patitas", city: "Sabaneta", category: "Tiendas de mascotas", phone: "+573001112205", rating: 4.7, reviewsCount: 60, hasSocialMedia: true, status: "PENDIENTE_CONSENTIMIENTO", consentStatus: "PENDIENTE", score: 75, recommendedService: "Landing/catálogo + WhatsApp automatizado", recommendedPackage: "Landing que Vende", source: "APIFY_GOOGLE_MAPS", daysAgo: 3 },
    { companyName: "Odontología Sonrisa Plena", city: "Bogotá", category: "Odontólogos", phone: "+573001112206", email: "citas@sonrisaplena.co", rating: 4.9, reviewsCount: 310, status: "CALIFICADO", consentStatus: "SIN_CONSENTIMIENTO", score: 90, recommendedService: "Automatización de agenda + recordatorios", recommendedPackage: "Automatización con IA", source: "APIFY_GOOGLE_MAPS", daysAgo: 2 },
    { companyName: "Hostal Mar Azul", city: "Cartagena", category: "Hostales", phone: "+573001112207", rating: 4.2, reviewsCount: 150, hasSocialMedia: true, status: "ENRIQUECIDO", consentStatus: "SIN_CONSENTIMIENTO", score: 72, recommendedService: "Asistente IA para WhatsApp", recommendedPackage: "WhatsApp Inteligente", source: "APIFY_GOOGLE_MAPS", daysAgo: 4 },
    { companyName: "Academia de Baile Ritmo", city: "Cali", category: "Academias", phone: "+573001112208", rating: 4.6, reviewsCount: 78, status: "NUEVO", consentStatus: "SIN_CONSENTIMIENTO", score: 68, source: "APIFY_GOOGLE_MAPS", daysAgo: 0 },
    // Con opt-in (canal permitido)
    { companyName: "Tienda de Ropa Kloset", contactName: "Laura Gómez", city: "Medellín", category: "Tiendas de ropa", phone: "+573001112210", email: "laura@kloset.co", hasSocialMedia: true, status: "CONTACTO_PERMITIDO", consentStatus: "OPT_IN", score: 78, recommendedService: "Landing/catálogo + WhatsApp automatizado", recommendedPackage: "Landing que Vende", source: "LANDING_FORM", daysAgo: 3 },
    { companyName: "Ferretería El Tornillo", contactName: "Carlos Ruiz", city: "Bello", category: "Ferreterías", phone: "+573001112211", status: "PRIMER_CONTACTO", consentStatus: "OPT_IN", score: 55, recommendedService: "Sitio web profesional + WhatsApp conectado", recommendedPackage: "Presencia Digital Inicial", source: "CLICK_TO_WHATSAPP", daysAgo: 5 },
    { companyName: "Spa Belleza Natural", contactName: "Diana Torres", city: "Envigado", category: "Clínicas estéticas", phone: "+573001112212", email: "diana@bellezanatural.co", status: "RESPONDIO", consentStatus: "OPT_IN", score: 82, recommendedService: "Automatización de agenda + recordatorios", recommendedPackage: "Automatización con IA", source: "WHATSAPP_INBOUND", daysAgo: 2 },
    { companyName: "Taller AutoMax", contactName: "Jorge Mejía", city: "Itagüí", category: "Talleres automotrices", phone: "+573001112213", status: "CONVERSACION_ACTIVA", consentStatus: "OPT_IN", score: 74, recommendedService: "Landing de captación + formulario inteligente + seguimiento", recommendedPackage: "Landing que Vende", source: "WHATSAPP_INBOUND", daysAgo: 1 },
    { companyName: "Restaurante Sabor Costeño", contactName: "María Pérez", city: "Barranquilla", category: "Restaurantes", phone: "+573001112214", status: "INTERESADO", consentStatus: "OPT_IN", score: 88, recommendedService: "Asistente IA para WhatsApp", recommendedPackage: "WhatsApp Inteligente", source: "QR", daysAgo: 6 },
    { companyName: "Inmobiliaria Hogar Ya", contactName: "Andrés López", city: "Pereira", category: "Inmobiliarias", phone: "+573001112215", email: "andres@hogarya.co", status: "DIAGNOSTICO_ENVIADO", consentStatus: "OPT_IN", score: 79, recommendedService: "Landing de captación + formulario inteligente + seguimiento", recommendedPackage: "Landing que Vende", source: "LANDING_FORM", daysAgo: 8 },
    { companyName: "Hotel Boutique Colonial", contactName: "Sofía Vargas", city: "Cartagena", category: "Hoteles pequeños", phone: "+573001112216", email: "gerencia@hotelcolonial.co", website: "https://hotelcolonial.co", status: "REUNION_AGENDADA", consentStatus: "OPT_IN", score: 76, recommendedService: "Analítica básica + mejoras de conversión", recommendedPackage: "Diagnóstico Digital", source: "REFERIDO", daysAgo: 10 },
    { companyName: "Escuela de Conducción Ruta Segura", contactName: "Pedro Sánchez", city: "Manizales", category: "Escuelas de conducción", phone: "+573001112217", status: "PROPUESTA_ENVIADA", consentStatus: "OPT_IN", score: 71, recommendedService: "Sitio web profesional + WhatsApp conectado", recommendedPackage: "Presencia Digital Inicial", source: "LANDING_FORM", daysAgo: 12 },
    { companyName: "Consultorios Médicos Vida", contactName: "Dra. Herrera", city: "Bogotá", category: "Consultorios", phone: "+573001112218", email: "info@consultoriosvida.co", status: "NEGOCIACION", consentStatus: "OPT_IN", score: 84, recommendedService: "Automatización de agenda + recordatorios", recommendedPackage: "Automatización con IA", source: "ANUNCIO", daysAgo: 15 },
    { companyName: "Panadería La Espiga Dorada", contactName: "Rosa Muñoz", city: "Medellín", category: "Emprendimientos locales", phone: "+573001112219", status: "GANADO", consentStatus: "OPT_IN", score: 77, recommendedService: "Sitio web profesional + WhatsApp conectado", recommendedPackage: "Presencia Digital Inicial", source: "REFERIDO", daysAgo: 20 },
    { companyName: "Gimnasio PowerFit", contactName: "Iván Castro", city: "Cali", category: "Gimnasios", phone: "+573001112220", status: "PERDIDO", consentStatus: "OPT_IN", score: 62, recommendedService: "Landing page para campañas y ventas", recommendedPackage: "Landing que Vende", source: "ANUNCIO", daysAgo: 18 },
    // Opt-out (lista de no contactar)
    { companyName: "Tienda Don José", city: "Armenia", category: "Emprendimientos locales", phone: "+573001112221", status: "OPT_OUT", consentStatus: "OPT_OUT", score: 40, source: "APIFY_GOOGLE_MAPS", daysAgo: 9 },
  ];

  for (const mock of mockLeads) {
    const createdAt = new Date(Date.now() - (mock.daysAgo ?? 0) * 86400000);
    const lead = await db.lead.create({
      data: {
        companyName: mock.companyName,
        contactName: mock.contactName,
        city: mock.city,
        country: "Colombia",
        category: mock.category,
        phone: mock.phone,
        email: mock.email,
        website: mock.website,
        googleMapsUrl: mock.source === "APIFY_GOOGLE_MAPS" ? `https://maps.google.com/?cid=seed-${mock.companyName.replace(/\W/g, "")}` : undefined,
        rating: mock.rating,
        reviewsCount: mock.reviewsCount,
        hasWebsite: Boolean(mock.website),
        hasWhatsapp: Boolean(mock.phone),
        hasEmail: Boolean(mock.email),
        hasSocialMedia: Boolean(mock.hasSocialMedia),
        socialMedia: mock.hasSocialMedia ? { instagram: `https://instagram.com/${mock.companyName.toLowerCase().replace(/\W+/g, "_")}` } : undefined,
        source: (mock.source ?? "MANUAL") as never,
        status: mock.status as never,
        consentStatus: mock.consentStatus as never,
        score: mock.score,
        scoreBreakdown: [
          { rule: "seed", label: "Score inicial de datos de prueba", points: mock.score },
        ],
        recommendedService: mock.recommendedService,
        recommendedPackage: mock.recommendedPackage,
        digitalOpportunitySummary: !mock.website
          ? "Sin sitio web propio. WhatsApp como canal principal."
          : "Tiene sitio pero probablemente no mide resultados.",
        enrichedAt: mock.status !== "NUEVO" ? createdAt : null,
        optInDate: mock.consentStatus === "OPT_IN" ? createdAt : null,
        optOutDate: mock.consentStatus === "OPT_OUT" ? createdAt : null,
        lostReason: mock.status === "PERDIDO" ? "Eligió otra agencia por precio" : null,
        createdAt,
        lastInteraction: mock.consentStatus === "OPT_IN" ? new Date(Date.now() - 86400000) : null,
      },
    });

    if (mock.consentStatus === "OPT_IN") {
      await db.consentEvent.create({
        data: {
          leadId: lead.id,
          type: "OPT_IN",
          channel: mock.source === "LANDING_FORM" ? "landing" : "whatsapp",
          source: mock.source === "LANDING_FORM"
            ? "Formulario landing con casilla de consentimiento"
            : "El lead escribió primero por WhatsApp",
          evidence: "Seed de datos de prueba",
          createdAt,
        },
      });
    }
    if (mock.consentStatus === "OPT_OUT") {
      await db.consentEvent.create({
        data: {
          leadId: lead.id,
          type: "OPT_OUT",
          channel: "whatsapp",
          evidence: "no me escribas más",
          createdAt,
        },
      });
    }
  }

  console.log("→ Seed: conversaciones y mensajes mock");
  const conversationalLeads = await db.lead.findMany({
    where: { status: { in: ["RESPONDIO", "CONVERSACION_ACTIVA", "INTERESADO", "DIAGNOSTICO_ENVIADO"] } },
  });
  for (const lead of conversationalLeads) {
    const conv = await db.conversation.create({
      data: {
        leadId: lead.id,
        status: lead.status === "INTERESADO" ? "PENDIENTE_HUMANO" : "ABIERTA",
        aiEnabled: lead.status !== "INTERESADO",
        lastMessageAt: new Date(Date.now() - 3600000),
        lastInboundAt: new Date(Date.now() - 3600000),
        nextAction: lead.status === "INTERESADO" ? "Lead caliente: proponer reunión de 15 min" : null,
        aiSummary: lead.status === "INTERESADO"
          ? "Dolor principal: responde mensajes manualmente todo el día.\nServicio recomendado: Asistente IA para WhatsApp.\nNivel de interés: alto\nPróximo paso: agendar llamada de 15 min.\nObjeciones: precio.\nPresupuesto: no mencionado"
          : null,
      },
    });
    const exchanges = [
      { direction: "ENTRANTE" as const, content: "Hola, vi su página y quiero información", intent: "SALUDO" },
      { direction: "SALIENTE" as const, content: "Hola 👋 Soy el asistente de Dos Nodos. Ayudamos a negocios a vender mejor con sitios web, automatizaciones e IA. ¿Quieres que revisemos rápidamente qué podría mejorar tu negocio digitalmente?", ai: true },
      { direction: "ENTRANTE" as const, content: `Sí claro, tengo ${lead.category?.toLowerCase() ?? "un negocio"} y respondo muchos mensajes manualmente`, intent: "QUIERE_AUTOMATIZAR" },
      { direction: "SALIENTE" as const, content: "Automatizar te ahorra horas al día: respuestas frecuentes, agendamiento, seguimiento de clientes. ¿Qué proceso te quita más tiempo hoy: responder mensajes, agendar citas o hacer seguimiento?", ai: true },
    ];
    let minutesAgo = 240;
    for (const msg of exchanges) {
      await db.message.create({
        data: {
          conversationId: conv.id,
          leadId: lead.id,
          direction: msg.direction,
          content: msg.content,
          status: msg.direction === "ENTRANTE" ? "ENTREGADO" : "LEIDO",
          detectedIntent: msg.intent,
          sentByAi: Boolean(msg.ai),
          sentAt: new Date(Date.now() - minutesAgo * 60000),
          createdAt: new Date(Date.now() - minutesAgo * 60000),
        },
      });
      minutesAgo -= 45;
    }
  }

  console.log("→ Seed: oportunidades, reuniones y tareas");
  const oppLeads = await db.lead.findMany({
    where: { status: { in: ["INTERESADO", "DIAGNOSTICO_ENVIADO", "REUNION_AGENDADA", "PROPUESTA_ENVIADA", "NEGOCIACION", "GANADO", "PERDIDO"] } },
  });
  for (const lead of oppLeads) {
    const stage =
      lead.status === "GANADO" ? "GANADA"
      : lead.status === "PERDIDO" ? "PERDIDA"
      : lead.status === "NEGOCIACION" || lead.status === "PROPUESTA_ENVIADA" ? "NEGOCIACION"
      : "DIAGNOSTICO";
    await db.opportunity.create({
      data: {
        leadId: lead.id,
        service: lead.recommendedService ?? "Sitio web",
        packageName: lead.recommendedPackage,
        estimatedValue: 800000 + Math.floor(Math.random() * 4) * 400000,
        stage: stage as never,
        probability: stage === "GANADA" ? 100 : stage === "PERDIDA" ? 0 : 50,
        lostReason: lead.status === "PERDIDO" ? lead.lostReason : null,
      },
    });
  }

  const meetingLead = await db.lead.findFirst({ where: { status: "REUNION_AGENDADA" } });
  if (meetingLead) {
    await db.meeting.create({
      data: {
        leadId: meetingLead.id,
        title: "Llamada de diagnóstico (15 min)",
        scheduledAt: new Date(Date.now() + 2 * 86400000),
        durationMin: 15,
        status: "AGENDADA",
      },
    });
  }

  const taskLead = await db.lead.findFirst({ where: { status: "INTERESADO" } });
  if (taskLead) {
    await db.task.create({
      data: {
        leadId: taskLead.id,
        title: `Atender conversación de ${taskLead.companyName}`,
        description: "Lead caliente esperando humano (pidió precio)",
        dueDate: new Date(),
        assignedToId: admin.id,
      },
    });
  }

  console.log("→ Seed: campaña de ejemplo y run de Apify");
  const template = await db.whatsappTemplate.findUnique({ where: { name: "diagnostico_gratuito" } });
  await db.campaign.create({
    data: {
      name: "Seguimiento leads opt-in score 70+",
      type: "SEGUIMIENTO",
      channel: "WHATSAPP",
      status: "BORRADOR",
      dailyLimit: 15,
      hourlyLimit: 5,
      templateId: template?.id,
      audienceFilter: { scoreMin: 70 },
    },
  });
  await db.apifyRun.create({
    data: {
      actorId: "mock",
      status: "COMPLETADO",
      input: { city: "Medellín", category: "Restaurantes", maxResults: 10 },
      totalResults: 10,
      newLeads: 8,
      duplicates: 2,
      startedAt: new Date(Date.now() - 86400000),
      finishedAt: new Date(Date.now() - 86400000 + 120000),
    },
  });

  await db.auditLog.create({
    data: { actor: "system", action: "seed.completed", detail: { leads: mockLeads.length } },
  });

  console.log("✓ Seed completado");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
