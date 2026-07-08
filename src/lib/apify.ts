import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { scoreLead } from "@/lib/scoring";
import { recommendService } from "@/lib/recommendation";
import type { Prisma } from "@prisma/client";

/**
 * Lead Hunter — integración con Apify Google Maps Scraper.
 *
 * Con APIFY_TOKEN ejecuta el actor real (run-sync-get-dataset-items).
 * Sin token corre en modo mock: genera negocios realistas para poder probar
 * el pipeline completo (dedupe → enriquecimiento → scoring → CRM).
 *
 * IMPORTANTE: los leads capturados aquí entran SIEMPRE con
 * consentStatus = SIN_CONSENTIMIENTO. El guard de cumplimiento impide
 * enviarles WhatsApp hasta que exista opt-in trazable.
 */

export type HunterInput = {
  city: string;
  category: string;
  keywords?: string;
  maxResults?: number;
};

type ScrapedPlace = {
  title: string;
  categoryName?: string;
  address?: string;
  city?: string;
  countryCode?: string;
  phone?: string;
  website?: string;
  url?: string; // Google Maps URL
  totalScore?: number;
  reviewsCount?: number;
  openingHours?: { day: string; hours: string }[];
  emails?: string[];
  instagrams?: string[];
  facebooks?: string[];
};

const APIFY_BASE = "https://api.apify.com/v2";

function actorId() {
  return process.env.APIFY_GOOGLE_MAPS_ACTOR_ID ?? "compass~crawler-google-places";
}

async function runApifyActor(input: HunterInput): Promise<ScrapedPlace[]> {
  const token = process.env.APIFY_TOKEN;
  const search = [input.category, input.keywords].filter(Boolean).join(" ");
  const body = {
    searchStringsArray: [search],
    locationQuery: `${input.city}, Colombia`,
    maxCrawledPlacesPerSearch: input.maxResults ?? 20,
    language: "es",
    scrapeContacts: true,
  };
  const res = await fetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(actorId())}/run-sync-get-dataset-items?token=${token}&timeout=300`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as ScrapedPlace[];
}

// ── Modo mock ────────────────────────────────────────────────────
const MOCK_NAMES: Record<string, string[]> = {
  default: ["El Buen Sabor", "Donde Marta", "La Esquina", "Punto Clave", "Rincón Paisa", "Casa Central", "El Portal", "Estrella Dorada", "Nuevo Horizonte", "La Colina"],
};

function mockPlaces(input: HunterInput): ScrapedPlace[] {
  const count = Math.min(input.maxResults ?? 10, 10);
  const names = MOCK_NAMES.default;
  return Array.from({ length: count }, (_, i) => {
    const hasWebsite = Math.random() > 0.6;
    const hasSocial = Math.random() > 0.4;
    const seed = Math.random().toString(36).slice(2, 8);
    return {
      title: `${input.category.replace(/s$/, "")} ${names[i % names.length]}`,
      categoryName: input.category,
      address: `Calle ${10 + i} # ${20 + i}-${30 + i}, ${input.city}`,
      city: input.city,
      countryCode: "CO",
      phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`,
      website: hasWebsite ? `https://negocio-${seed}.negocio.site` : undefined,
      url: `https://maps.google.com/?cid=mock-${seed}`,
      totalScore: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      reviewsCount: Math.floor(Math.random() * 200),
      emails: Math.random() > 0.7 ? [`contacto@negocio-${seed}.co`] : [],
      instagrams: hasSocial ? [`https://instagram.com/negocio_${seed}`] : [],
      facebooks: [],
    };
  });
}

// ── Pipeline principal ───────────────────────────────────────────

export async function runLeadHunter(input: HunterInput) {
  const useMock = !process.env.APIFY_TOKEN;
  const run = await db.apifyRun.create({
    data: {
      actorId: useMock ? "mock" : actorId(),
      status: "EN_EJECUCION",
      input: input as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    const places = useMock ? mockPlaces(input) : await runApifyActor(input);
    const minRating = await getSetting("leadHunter.minRating");
    const minReviews = await getSetting("leadHunter.minReviews");

    let newLeads = 0;
    let duplicates = 0;
    let filtered = 0;

    for (const place of places) {
      if (!place.title) continue;
      if ((place.totalScore ?? 0) < minRating || (place.reviewsCount ?? 0) < minReviews) {
        filtered++;
        continue;
      }

      // Dedupe: por URL de Maps, o por teléfono, o por nombre+ciudad
      const existing = await db.lead.findFirst({
        where: {
          OR: [
            ...(place.url ? [{ googleMapsUrl: place.url }] : []),
            ...(place.phone ? [{ phone: place.phone }] : []),
            { companyName: place.title, city: place.city ?? input.city },
          ],
        },
      });
      if (existing) {
        duplicates++;
        continue;
      }

      const socialMedia: Record<string, string> = {};
      if (place.instagrams?.[0]) socialMedia.instagram = place.instagrams[0];
      if (place.facebooks?.[0]) socialMedia.facebook = place.facebooks[0];

      const leadData = {
        companyName: place.title,
        category: place.categoryName ?? input.category,
        address: place.address,
        city: place.city ?? input.city,
        country: "Colombia",
        phone: place.phone,
        email: place.emails?.[0],
        website: place.website,
        googleMapsUrl: place.url,
        rating: place.totalScore,
        reviewsCount: place.reviewsCount,
        openingHours: place.openingHours
          ? place.openingHours.map((h) => `${h.day}: ${h.hours}`).join(" · ")
          : undefined,
        socialMedia: Object.keys(socialMedia).length ? socialMedia : undefined,
        hasWebsite: Boolean(place.website),
        hasWhatsapp: Boolean(place.phone),
        hasEmail: Boolean(place.emails?.length),
        hasSocialMedia: Object.keys(socialMedia).length > 0,
        source: "APIFY_GOOGLE_MAPS" as const,
        sourceDetail: `run:${run.id}`,
        sourceUrl: place.url,
        status: "NUEVO" as const,
        consentStatus: "SIN_CONSENTIMIENTO" as const,
      };

      const lead = await db.lead.create({ data: leadData });
      // Enriquecimiento inmediato: score + recomendación
      await enrichLead(lead.id);
      newLeads++;
    }

    const finished = await db.apifyRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETADO",
        totalResults: places.length,
        newLeads,
        duplicates,
        finishedAt: new Date(),
      },
    });
    await audit({
      action: "leadhunter.run.completed",
      entity: "apify_run",
      entityId: run.id,
      detail: {
        city: input.city,
        category: input.category,
        total: places.length,
        newLeads,
        duplicates,
        filtered,
        mock: useMock,
      },
    });
    return finished;
  } catch (err) {
    await db.apifyRun.update({
      where: { id: run.id },
      data: { status: "FALLIDO", error: String(err), finishedAt: new Date() },
    });
    await audit({
      action: "leadhunter.run.failed",
      entity: "apify_run",
      entityId: run.id,
      level: "error",
      detail: { error: String(err) },
    });
    throw err;
  }
}

/** Enriquece un lead: recalcula señales, score y servicio recomendado. */
export async function enrichLead(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const { score, breakdown } = await scoreLead(lead);
  const recommendation = recommendService(lead);

  const opportunities: string[] = [];
  if (!lead.hasWebsite) opportunities.push("Sin sitio web propio");
  if (lead.hasSocialMedia && !lead.hasWebsite) opportunities.push("Depende de redes sociales");
  if (lead.hasWhatsapp && !lead.hasWebsite) opportunities.push("WhatsApp como canal principal");
  if ((lead.reviewsCount ?? 0) > 50 && !lead.hasWebsite)
    opportunities.push("Muchas reseñas pero poca estructura digital");
  if ((lead.rating ?? 0) >= 4.2) opportunities.push("Buena reputación aprovechable con SEO local");

  return db.lead.update({
    where: { id: leadId },
    data: {
      score,
      scoreBreakdown: breakdown,
      recommendedService: recommendation.service,
      recommendedPackage: recommendation.packageName,
      digitalOpportunitySummary: opportunities.join(". ") || "Presencia digital básica cubierta.",
      enrichedAt: new Date(),
      status: lead.status === "NUEVO" ? (score >= 31 ? "CALIFICADO" : "ENRIQUECIDO") : lead.status,
      scoreHistory: { create: { score, breakdown } },
    },
  });
}
