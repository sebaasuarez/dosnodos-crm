import type { Lead } from "@prisma/client";

/**
 * Motor de recomendación de servicios Dos Nodos según señales del negocio.
 * Reglas simples y explicables — el orden define la prioridad.
 */

export type Recommendation = {
  service: string;
  packageName: string;
  reason: string;
};

type LeadSignals = Pick<
  Lead,
  | "hasWebsite" | "hasSocialMedia" | "hasWhatsapp" | "website"
  | "category" | "googleMapsUrl" | "reviewsCount"
>;

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PRODUCT_CATEGORIES = ["tienda", "ropa", "mascota", "ferreteria"];
const SERVICE_CATEGORIES = [
  "barberia", "salon", "estetica", "odontolog", "gimnasio", "inmobiliaria",
  "taller", "academia", "consultorio", "conduccion",
];
const APPOINTMENT_CATEGORIES = [
  "barberia", "salon", "estetica", "odontolog", "consultorio", "clinica",
];
const HIGH_MESSAGE_CATEGORIES = ["restaurante", "hotel", "hostal", "turistic", "inmobiliaria"];

export function recommendService(lead: LeadSignals): Recommendation {
  const category = normalize(lead.category ?? "");

  if (!lead.hasWebsite && !lead.website) {
    if (lead.googleMapsUrl && (lead.reviewsCount ?? 0) > 0) {
      return {
        service: "SEO local + página de presencia digital",
        packageName: "Presencia Digital Inicial",
        reason: "Aparece en Google Maps pero no tiene sitio web propio.",
      };
    }
    return {
      service: "Sitio web profesional + WhatsApp conectado",
      packageName: "Presencia Digital Inicial",
      reason: "El negocio no tiene sitio web.",
    };
  }

  if (lead.hasSocialMedia && !lead.hasWebsite) {
    return {
      service: "Landing page para campañas y ventas",
      packageName: "Landing que Vende",
      reason: "Tiene redes sociales activas pero no una landing propia.",
    };
  }

  if (HIGH_MESSAGE_CATEGORIES.some((c) => category.includes(c))) {
    return {
      service: "Asistente IA para WhatsApp",
      packageName: "WhatsApp Inteligente",
      reason: "Este tipo de negocio recibe muchas preguntas repetidas por WhatsApp.",
    };
  }

  if (APPOINTMENT_CATEGORIES.some((c) => category.includes(c))) {
    return {
      service: "Automatización de agenda + recordatorios",
      packageName: "Automatización con IA",
      reason: "El negocio agenda citas y puede automatizar recordatorios.",
    };
  }

  if (PRODUCT_CATEGORIES.some((c) => category.includes(c))) {
    return {
      service: "Landing/catálogo + WhatsApp automatizado",
      packageName: "Landing que Vende",
      reason: "El negocio vende productos y necesita catálogo con canal de pedido.",
    };
  }

  if (SERVICE_CATEGORIES.some((c) => category.includes(c))) {
    return {
      service: "Landing de captación + formulario inteligente + seguimiento",
      packageName: "Landing que Vende",
      reason: "El negocio presta servicios y puede captar prospectos con formularios.",
    };
  }

  // Tiene sitio web pero probablemente no mide
  return {
    service: "Analítica básica + mejoras de conversión",
    packageName: "Diagnóstico Digital",
    reason: "Tiene sitio web pero probablemente no mide resultados.",
  };
}
