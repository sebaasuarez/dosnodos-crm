import type { Lead } from "@prisma/client";
import { getSetting } from "@/lib/settings";

/**
 * Motor de scoring comercial (0-100).
 * Cada variable aporta puntos según la configuración editable en Settings.
 */

export type ScoreBreakdown = {
  rule: string;
  label: string;
  points: number;
}[];

// Categorías con alta necesidad digital (coinciden por subcadena, sin tildes)
const HIGH_NEED_CATEGORIES = [
  "restaurante", "cafe", "barberia", "salon", "estetica", "odontolog",
  "gimnasio", "ropa", "mascota", "inmobiliaria", "taller", "hotel",
  "hostal", "turistic", "academia", "consultorio", "conduccion",
];

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export type ScoreSettings = {
  weights: Awaited<ReturnType<typeof getSetting<"scoring.weights">>>;
  manyReviewsThreshold: number;
  goodRatingThreshold: number;
};

export async function loadScoreSettings(): Promise<ScoreSettings> {
  const [weights, manyReviewsThreshold, goodRatingThreshold] = await Promise.all([
    getSetting("scoring.weights"),
    getSetting("scoring.manyReviewsThreshold"),
    getSetting("scoring.goodRatingThreshold"),
  ]);
  return { weights, manyReviewsThreshold, goodRatingThreshold };
}

type ScorableLead = Pick<
  Lead,
  | "hasWebsite" | "hasWhatsapp" | "hasEmail" | "hasSocialMedia"
  | "phone" | "email" | "website" | "category" | "rating" | "reviewsCount"
>;

/**
 * Cálculo puro del score, sin acceso a BD. Úsalo cuando ya tienes los
 * `ScoreSettings` cargados (p.ej. al procesar muchos leads en lote —
 * evita una query de settings por cada fila).
 */
export function computeScore(
  lead: ScorableLead,
  { weights, manyReviewsThreshold, goodRatingThreshold }: ScoreSettings,
): { score: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = [];
  const add = (rule: string, label: string, points: number) => {
    if (points > 0) breakdown.push({ rule, label, points });
  };

  if (!lead.hasWebsite && !lead.website) {
    add("noWebsite", "No tiene sitio web", weights.noWebsite);
  }
  if (lead.phone) {
    add("hasPublicPhone", "Tiene teléfono/WhatsApp público", weights.hasPublicPhone);
  }
  if ((lead.reviewsCount ?? 0) >= manyReviewsThreshold) {
    add("manyReviews", `Tiene ${lead.reviewsCount} reseñas`, weights.manyReviews);
  }
  if ((lead.rating ?? 0) > goodRatingThreshold) {
    add("goodRating", `Rating ${lead.rating} (> ${goodRatingThreshold})`, weights.goodRating);
  }
  const category = normalize(lead.category ?? "");
  if (HIGH_NEED_CATEGORIES.some((c) => category.includes(c))) {
    add("highNeedCategory", "Categoría con alta necesidad digital", weights.highNeedCategory);
  }
  // Heurística: sitio en plataformas gratuitas / legadas ≈ desactualizado
  const site = (lead.website ?? "").toLowerCase();
  if (
    site &&
    /wixsite|blogspot|wordpress\.com|webnode|jimdo|es\.tl|negocio\.site|business\.site/.test(site)
  ) {
    add("outdatedWebsite", "Sitio web en plataforma gratuita/desactualizada", weights.outdatedWebsite);
  }
  if (lead.hasSocialMedia && !lead.hasWebsite) {
    add("socialNoLanding", "Redes activas pero sin landing propia", weights.socialNoLanding);
  }
  // Señal de crecimiento: buen rating + volumen medio de reseñas
  if ((lead.rating ?? 0) >= 4 && (lead.reviewsCount ?? 0) >= 20 && (lead.reviewsCount ?? 0) < manyReviewsThreshold) {
    add("growingBusiness", "Señales de negocio local en crecimiento", weights.growingBusiness);
  }
  if (lead.email || lead.hasEmail) {
    add("hasPublicEmail", "Tiene email público", weights.hasPublicEmail);
  }

  const score = Math.min(100, breakdown.reduce((sum, b) => sum + b.points, 0));
  return { score, breakdown };
}

/** Conveniencia para un solo lead: carga settings y calcula el score. */
export async function scoreLead(
  lead: ScorableLead,
): Promise<{ score: number; breakdown: ScoreBreakdown }> {
  const settings = await loadScoreSettings();
  return computeScore(lead, settings);
}

export function scorePriority(score: number): {
  label: string;
  tone: "low" | "medium" | "good" | "high";
} {
  if (score >= 81) return { label: "Oportunidad alta", tone: "high" };
  if (score >= 61) return { label: "Oportunidad buena", tone: "good" };
  if (score >= 31) return { label: "Prioridad media", tone: "medium" };
  return { label: "Baja prioridad", tone: "low" };
}
