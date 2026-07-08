import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Configuración operativa editable desde el dashboard.
 * Los valores por defecto aplican mientras no exista la fila en `settings`.
 */
export const DEFAULT_SETTINGS = {
  // Límites globales de envío por WhatsApp (anti-spam)
  "whatsapp.dailyLimit": 50,
  "whatsapp.hourlyLimit": 10,
  "whatsapp.allowedHoursStart": 8, // hora local Colombia
  "whatsapp.allowedHoursEnd": 19,
  "whatsapp.minHoursBetweenMessages": 24, // frecuencia máxima por lead (proactivos)
  "whatsapp.maxFollowUps": 2,

  // Lead Hunter (Apify)
  "leadHunter.enabled": true,
  "leadHunter.maxLeadsPerDay": 60,
  "leadHunter.minRating": 3.8,
  "leadHunter.minReviews": 5,
  "leadHunter.cities": [
    "Medellín", "Envigado", "Itagüí", "Sabaneta", "Bello",
    "Bogotá", "Cali", "Barranquilla", "Cartagena",
    "Pereira", "Manizales", "Armenia",
  ],
  "leadHunter.categories": [
    "Restaurantes", "Cafés", "Barberías", "Salones de belleza",
    "Clínicas estéticas", "Odontólogos", "Gimnasios", "Tiendas de ropa",
    "Tiendas de mascotas", "Ferreterías", "Inmobiliarias", "Talleres automotrices",
    "Hoteles pequeños", "Hostales", "Negocios turísticos",
    "Escuelas de conducción", "Academias", "Consultorios", "Emprendimientos locales",
  ],
  "leadHunter.keywords": [] as string[],

  // Scoring (pesos editables — ver src/lib/scoring.ts)
  "scoring.weights": {
    noWebsite: 25,
    hasPublicPhone: 10,
    manyReviews: 10,
    goodRating: 10,
    highNeedCategory: 15,
    outdatedWebsite: 20,
    socialNoLanding: 15,
    growingBusiness: 10,
    hasPublicEmail: 5,
    brokenForms: 10,
  },
  "scoring.manyReviewsThreshold": 50,
  "scoring.goodRatingThreshold": 4.2,

  // Marca
  "brand.name": "Dos Nodos",
  "brand.tagline": "Conectamos tecnología con personas",
  "brand.mainUrl": "https://dosnodos.com.co",
  "brand.landingUrl": "https://ventas.dosnodos.com.co",

  // IA
  "ai.autoReplyEnabled": true,
  "ai.escalationScoreThreshold": 80,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<(typeof DEFAULT_SETTINGS)[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return DEFAULT_SETTINGS[key];
  return row.value as (typeof DEFAULT_SETTINGS)[K];
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db.setting.findMany();
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[row.key] = row.value;
  return merged;
}

export async function setSetting(key: string, value: Prisma.InputJsonValue) {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
