/**
 * Detección de intenciones por reglas (sin LLM).
 * Sirve de base determinista; la IA puede refinar la clasificación cuando hay API key.
 */

export type Intent =
  | "OPT_OUT"
  | "QUIERE_HUMANO"
  | "RECLAMO"
  | "QUIERE_PRECIO"
  | "QUIERE_LLAMADA"
  | "QUIERE_WEB"
  | "QUIERE_VENDER_MAS"
  | "QUIERE_AUTOMATIZAR"
  | "QUIERE_CHATBOT"
  | "QUIERE_EJEMPLOS"
  | "QUIERE_PENSARLO"
  | "NO_INTERESA"
  | "PREGUNTA_QUIENES_SOMOS"
  | "PREGUNTA_TIEMPOS"
  | "PREGUNTA_PAGOS"
  | "PREGUNTA_SOPORTE"
  | "PREGUNTA_MANTENIMIENTO"
  | "PREGUNTA_TIPO_NEGOCIO"
  | "ACEPTA_DIAGNOSTICO"
  | "SALUDO"
  | "OTRO";

function normalize(text: string) {
  return ` ${text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")} `;
}

// Orden importa: primero cumplimiento (opt-out), luego escalamiento, luego ventas.
const RULES: { intent: Intent; patterns: RegExp[] }[] = [
  {
    intent: "OPT_OUT",
    patterns: [
      /\bno me escribas?\b/, /\bno me contacten?\b/, /\bstop\b/, /\bsalir\b/,
      /\bcancelar\b/, /\beliminar\b/, /\bbaja\b/, /\bno mas mensajes\b/,
      /\bdejen? de escribir/, /\bborrame\b/, /\bno quiero recibir/,
    ],
  },
  {
    intent: "RECLAMO",
    patterns: [
      /\bmolesto\b/, /\bmolesta\b/, /\bqueja\b/, /\breclamo\b/, /\bpesimo\b/,
      /\bspam\b/, /\bfastidio\b/, /\bdenunciar\b/,
    ],
  },
  {
    intent: "QUIERE_HUMANO",
    patterns: [
      /\bhablar con (una? )?(persona|humano|asesor|alguien)\b/, /\bun humano\b/,
      /\basesor\b/, /\balguien real\b/, /\beres un bot\b/,
    ],
  },
  {
    intent: "QUIERE_PRECIO",
    patterns: [
      /\bprecio\b/, /\bcuanto (cuesta|vale|cobran|sale)\b/, /\bcostos?\b/,
      /\btarifa\b/, /\bpresupuesto\b/, /\bcotiza/,
    ],
  },
  {
    intent: "QUIERE_LLAMADA",
    patterns: [
      /\bllamada\b/, /\bllamame\b/, /\bme pueden llamar\b/, /\bagendar\b/,
      /\breunion\b/, /\bcita\b/, /\bvideollamada\b/,
    ],
  },
  {
    intent: "ACEPTA_DIAGNOSTICO",
    patterns: [
      /\bdiagnostico\b/, /\bsi,? me interesa\b/, /\bme gustaria (verlo|saberlo|recibirlo)\b/,
      /\bde una\b/, /\bclaro que si\b/, /\bhagamoslo\b/,
    ],
  },
  {
    intent: "QUIERE_WEB",
    patterns: [
      /\bpagina web\b/, /\bsitio web\b/, /\buna web\b/, /\bnecesito (una )?pagina\b/,
      /\blanding\b/,
    ],
  },
  {
    intent: "QUIERE_CHATBOT",
    patterns: [/\bchatbot\b/, /\bbot de whatsapp\b/, /\basistente virtual\b/],
  },
  {
    intent: "QUIERE_AUTOMATIZAR",
    patterns: [
      /\bautomatizar\b/, /\bautomatizacion\b/, /\brespond(o|er) muchos mensajes\b/,
      /\bprocesos? manual/, /\bahorrar tiempo\b/,
    ],
  },
  {
    intent: "QUIERE_VENDER_MAS",
    patterns: [
      /\bvender mas\b/, /\bmas clientes\b/, /\bmas ventas\b/, /\bconseguir clientes\b/,
      /\bcampanas?\b/, /\bpublicidad\b/,
    ],
  },
  {
    intent: "QUIERE_EJEMPLOS",
    patterns: [/\bejemplos?\b/, /\bportafolio\b/, /\btrabajos (anteriores|hechos)\b/, /\bcasos de exito\b/],
  },
  {
    intent: "PREGUNTA_QUIENES_SOMOS",
    patterns: [/\bquienes son\b/, /\bque es dos nodos\b/, /\bde donde son\b/, /\bque hacen\b/],
  },
  {
    intent: "PREGUNTA_TIEMPOS",
    patterns: [/\bcuanto (tiempo|demora|tarda)\b/, /\btiempos? de entrega\b/, /\bpara cuando\b/],
  },
  {
    intent: "PREGUNTA_PAGOS",
    patterns: [/\bformas? de pago\b/, /\bcomo se paga\b/, /\bfinanciacion\b/, /\bcuotas\b/, /\bnequi\b/, /\bdaviplata\b/],
  },
  {
    intent: "PREGUNTA_SOPORTE",
    patterns: [/\bsoporte\b/, /\bgarantia\b/, /\bsi algo falla\b/],
  },
  {
    intent: "PREGUNTA_MANTENIMIENTO",
    patterns: [/\bmantenimiento\b/, /\bactualizaciones\b/, /\bhosting\b/, /\bdominio\b/],
  },
  {
    intent: "PREGUNTA_TIPO_NEGOCIO",
    patterns: [/\btrabajan con\b/, /\bmi (negocio|empresa) es\b/, /\bsirve para\b/, /\baplica para\b/],
  },
  {
    intent: "QUIERE_PENSARLO",
    patterns: [/\blo pienso\b/, /\bdejame pensarlo\b/, /\bmas adelante\b/, /\bluego (les|te) escribo\b/, /\bdespues\b/],
  },
  {
    intent: "NO_INTERESA",
    patterns: [/\bno me interesa\b/, /\bno gracias\b/, /\bno por ahora\b/, /\bno necesito\b/],
  },
  {
    intent: "SALUDO",
    patterns: [/\bhola\b/, /\bbuenas\b/, /\bbuenos dias\b/, /\bbuenas tardes\b/, /\bbuenas noches\b/, /\binfo(rmacion)?\b/],
  },
];

export function detectIntent(message: string): Intent {
  const text = normalize(message);
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.intent;
  }
  return "OTRO";
}

/** Intenciones que marcan el lead como caliente. */
export const HOT_INTENTS: Intent[] = [
  "QUIERE_PRECIO",
  "QUIERE_LLAMADA",
  "QUIERE_WEB",
  "QUIERE_AUTOMATIZAR",
  "QUIERE_CHATBOT",
  "QUIERE_VENDER_MAS",
  "PREGUNTA_TIEMPOS",
  "PREGUNTA_PAGOS",
  "ACEPTA_DIAGNOSTICO",
];

/** Intenciones que exigen pasar la conversación a un humano. */
export const ESCALATION_INTENTS: Intent[] = ["QUIERE_HUMANO", "RECLAMO"];
