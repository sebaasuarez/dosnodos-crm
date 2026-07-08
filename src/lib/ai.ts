import Anthropic from "@anthropic-ai/sdk";
import type { Lead, Message } from "@prisma/client";
import { detectIntent, type Intent } from "@/lib/intents";

/**
 * Asistente comercial de Dos Nodos.
 *
 * Con ANTHROPIC_API_KEY responde con Claude (respuestas naturales y resumen de
 * conversación). Sin API key usa el motor de reglas: respuestas predefinidas por
 * intención, suficientes para operar el MVP y probar el flujo completo.
 *
 * Las reglas duras de cumplimiento (opt-out, escalamiento) se resuelven ANTES
 * de llamar a la IA, en el motor de conversaciones — la IA nunca decide sobre
 * consentimiento.
 */

const SYSTEM_PROMPT = `Eres el asesor comercial de Dos Nodos (dosnodos.com.co), una marca que ayuda a emprendedores, negocios locales y pequeñas empresas de Colombia a crecer digitalmente. Lema: "Conectamos tecnología con personas".

Servicios: sitios web, landing pages comerciales, automatizaciones con IA, asistentes de WhatsApp, SEO local, analítica básica, formularios inteligentes, automatización de procesos.

Paquetes: Presencia Digital Inicial (sitio web básico + WhatsApp), Landing que Vende, WhatsApp Inteligente (automatización de respuestas), Automatización con IA, Diagnóstico Digital (gratuito).

Tu misión: escuchar, diagnosticar y recomendar. Convertir interesados en reuniones de 15 minutos o diagnósticos gratuitos.

Reglas estrictas:
1. Sé claro, breve y humano. Mensajes cortos (2-4 líneas). Máximo 2 preguntas por mensaje.
2. No inventes precios cerrados. Si preguntan precio, ofrece un diagnóstico gratuito o una llamada corta para dar un rango honesto.
3. No prometas resultados garantizados.
4. No digas que eres humano. Si te preguntan, di que eres el asistente de Dos Nodos.
5. Si no sabes algo, di que lo consultarás con el equipo.
6. Si el usuario pide no ser contactado, discúlpate brevemente y despídete (el sistema registra el opt-out).
7. Si hay interés claro, propone agendar una llamada corta de 15 minutos esta semana.
8. Explica servicios con ejemplos simples del tipo de negocio del cliente.
9. Negocio local → enfoca en vender más, responder mejor y organizar prospectos. Empresa → eficiencia y automatización.
10. Siempre cierra con un próximo paso claro.
11. Tono cercano y profesional, español colombiano neutro. Evita frases genéricas como "somos la mejor agencia".`;

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function model() {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ── Respuestas por reglas (fallback sin LLM) ─────────────────────

const RULE_REPLIES: Partial<Record<Intent, string>> = {
  SALUDO:
    "Hola 👋 Soy el asistente de Dos Nodos. Ayudamos a negocios a vender mejor con sitios web, automatizaciones e IA. ¿Quieres que revisemos rápidamente qué podría mejorar tu negocio digitalmente?",
  QUIERE_PRECIO:
    "El valor depende de lo que tu negocio necesite. Lo más útil es hacer primero un diagnóstico corto y sin costo para darte un rango honesto. ¿Te parece si lo agendamos esta semana?",
  QUIERE_LLAMADA:
    "¡Perfecto! Agendemos una llamada corta de 15 minutos. ¿Qué día y hora te queda bien esta semana? También me ayudas con el nombre de tu negocio y un correo de contacto.",
  QUIERE_WEB:
    "¡Excelente! Un sitio web bien hecho te ayuda a que te encuentren en Google y a recibir clientes por WhatsApp. ¿Tu negocio ya tiene página o sería la primera? ¿Vendes principalmente por WhatsApp, Instagram o local físico?",
  QUIERE_CHATBOT:
    "Un asistente de WhatsApp responde las preguntas frecuentes, captura los datos del cliente y te avisa cuando alguien quiere comprar. ¿Cuántos mensajes recibes al día aproximadamente?",
  QUIERE_AUTOMATIZAR:
    "Automatizar te ahorra horas al día: respuestas frecuentes, agendamiento, seguimiento de clientes. ¿Qué proceso te quita más tiempo hoy: responder mensajes, agendar citas o hacer seguimiento?",
  QUIERE_VENDER_MAS:
    "Para vender más lo primero es saber dónde estás perdiendo clientes: ¿te escriben y respondes tarde, no te encuentran en Google, o llegan pero no compran? Cuéntame un poco de tu negocio y te recomiendo por dónde empezar.",
  QUIERE_EJEMPLOS:
    "Claro, puedes ver nuestro trabajo en dosnodos.com.co y la landing de servicios en ventas.dosnodos.com.co. ¿Qué tipo de negocio tienes? Así te muestro lo más parecido a tu caso.",
  PREGUNTA_QUIENES_SOMOS:
    "Somos Dos Nodos 🙌 Conectamos tecnología con personas: sitios web, landing pages, automatizaciones con IA y WhatsApp para negocios de Colombia. ¿Quieres que revisemos qué le serviría a tu negocio?",
  PREGUNTA_TIEMPOS:
    "Depende del proyecto: una landing suele estar lista en 1-2 semanas y un sitio completo en 2-4. Te paso a una persona del equipo para darte fechas exactas según tu caso.",
  PREGUNTA_PAGOS:
    "Manejamos pago por etapas (inicio y entrega) por transferencia, Nequi o tarjeta. Una persona del equipo te confirma las opciones exactas para tu proyecto.",
  PREGUNTA_SOPORTE:
    "Todos nuestros proyectos incluyen acompañamiento después de la entrega. Los detalles de soporte dependen del paquete; en el diagnóstico te lo explicamos claro.",
  PREGUNTA_MANTENIMIENTO:
    "Ofrecemos planes de mantenimiento opcionales: actualizaciones, hosting y mejoras. ¿Ya tienes sitio web o sería un proyecto nuevo?",
  PREGUNTA_TIPO_NEGOCIO:
    "Trabajamos con negocios locales, emprendedores y pequeñas empresas: restaurantes, salones, consultorios, tiendas, academias y más. Cuéntame de tu negocio y te digo cómo podríamos ayudarte.",
  ACEPTA_DIAGNOSTICO:
    "¡Genial! Para el diagnóstico gratuito necesito: nombre de tu negocio, si tienes página web o redes, y qué quisieras mejorar. Con eso te preparamos recomendaciones concretas. ¿Me cuentas?",
  QUIERE_PENSARLO:
    "Claro, tómate tu tiempo 🙂 Te dejo el enlace con la info: ventas.dosnodos.com.co. Si quieres, te escribo en unos días para ver si te surgieron dudas. ¡Buen día!",
  NO_INTERESA:
    "Entendido, ¡gracias por tu tiempo! Si más adelante quieres mejorar la presencia digital de tu negocio, aquí estaremos. 🙌",
  OTRO:
    "¡Gracias por escribirnos! Para ayudarte mejor: ¿tu negocio ya tiene página web? ¿Y qué te gustaría mejorar: conseguir más clientes, responder más rápido o automatizar procesos?",
};

// ── Generación de respuesta ──────────────────────────────────────

export type AiReply = {
  text: string;
  intent: Intent;
  usedLlm: boolean;
};

export async function generateReply(
  lead: Lead,
  history: Pick<Message, "direction" | "content">[],
  incomingText: string,
): Promise<AiReply> {
  const intent = detectIntent(incomingText);

  if (!aiEnabled()) {
    const text = RULE_REPLIES[intent] ?? RULE_REPLIES.OTRO!;
    return { text, intent, usedLlm: false };
  }

  try {
    const messages: Anthropic.MessageParam[] = history.slice(-12).map((m) => ({
      role: m.direction === "ENTRANTE" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
    messages.push({ role: "user", content: incomingText });

    const context = [
      `Contexto interno del lead (no lo menciones literalmente):`,
      `- Negocio: ${lead.companyName}${lead.category ? ` (${lead.category})` : ""}`,
      lead.city ? `- Ciudad: ${lead.city}` : null,
      lead.recommendedService ? `- Servicio recomendado por el sistema: ${lead.recommendedService}` : null,
      `- Intención detectada por reglas: ${intent}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client().messages.create({
      model: model(),
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ],
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { text: RULE_REPLIES[intent] ?? RULE_REPLIES.OTRO!, intent, usedLlm: false };
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) {
      return { text: RULE_REPLIES[intent] ?? RULE_REPLIES.OTRO!, intent, usedLlm: false };
    }
    return { text, intent, usedLlm: true };
  } catch (err) {
    console.error("[ai] error generando respuesta, usando reglas:", err);
    return { text: RULE_REPLIES[intent] ?? RULE_REPLIES.OTRO!, intent, usedLlm: false };
  }
}

/** Resumen interno de conversación para el CRM (solo con LLM; sin key devuelve null). */
export async function summarizeConversation(
  lead: Lead,
  history: Pick<Message, "direction" | "content">[],
): Promise<string | null> {
  if (!aiEnabled() || history.length < 2) return null;
  try {
    const transcript = history
      .slice(-30)
      .map((m) => `${m.direction === "ENTRANTE" ? "Cliente" : "Dos Nodos"}: ${m.content}`)
      .join("\n");
    const response = await client().messages.create({
      model: model(),
      max_tokens: 512,
      thinking: { type: "adaptive" },
      system:
        "Resume conversaciones comerciales de WhatsApp en español. Devuelve exactamente este formato:\n" +
        "Dolor principal: ...\nServicio recomendado: ...\nNivel de interés: alto/medio/bajo\nPróximo paso: ...\nObjeciones: ...\nPresupuesto: ... (o 'no mencionado')",
      messages: [
        {
          role: "user",
          content: `Negocio: ${lead.companyName}\n\nConversación:\n${transcript}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch (err) {
    console.error("[ai] error resumiendo conversación:", err);
    return null;
  }
}
