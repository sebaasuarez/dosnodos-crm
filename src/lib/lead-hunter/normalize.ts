// Se usa "libphonenumber-js/core" con la metadata completa importada de forma
// explícita, en vez del paquete raíz o del bundle "max" autocontenido: bajo
// tsx (y otros loaders con interop CJS/ESM), el require interno que "max"
// hace de su propia metadata se resuelve mal y llega vacío en tiempo de
// ejecución (falla con "Cannot read properties of undefined (reading
// 'hasOwnProperty')" en cualquier país). Pasar la metadata nosotros mismos
// evita depender de ese wiring interno.
import { parsePhoneNumberFromString } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.max.json";
import type { NormalizedLeadInput } from "@/lib/lead-import";
import type { RawPlace } from "./apify-client";
import type { LeadHunterQueryConfig } from "./queries";

const MAX_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 500;

function truncate(value: string | undefined, max = MAX_TEXT_LENGTH): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Mapa mínimo de país → código ISO-3166 para libphonenumber-js. */
const COUNTRY_ISO: Record<string, string> = {
  colombia: "CO",
  méxico: "MX",
  mexico: "MX",
  perú: "PE",
  peru: "PE",
  chile: "CL",
  argentina: "AR",
  "estados unidos": "US",
};

function countryIso(country: string): string {
  const key = country.trim().toLowerCase();
  return COUNTRY_ISO[key] ?? "CO";
}

/**
 * Normaliza un teléfono a formato internacional E.164 (ej. +573001234567).
 * Si no se puede interpretar como número válido, devuelve `undefined` en vez
 * de guardar basura — un teléfono no parseable no cuenta como "tiene
 * teléfono" para efectos de filtrado de contacto.
 */
export function normalizePhone(raw: string | undefined, country: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();
  if (!cleaned) return undefined;
  try {
    const parsed = parsePhoneNumberFromString(cleaned, countryIso(country) as never, metadata as never);
    if (parsed && parsed.isValid()) return parsed.number; // ya viene en E.164
  } catch {
    // sigue al fallback
  }
  return undefined;
}

/** Normaliza una URL: agrega esquema si falta, valida forma, limita tamaño. */
export function normalizeUrl(raw: string | undefined): string | undefined {
  const trimmed = truncate(raw, MAX_URL_LENGTH);
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Normaliza un handle o URL de red social a una URL completa. */
export function normalizeSocialHandle(
  raw: string | undefined,
  platform: "instagram" | "facebook",
): string | undefined {
  const trimmed = truncate(raw, MAX_URL_LENGTH);
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return normalizeUrl(trimmed);
  const handle = trimmed.replace(/^@/, "");
  if (!handle) return undefined;
  return `https://${platform}.com/${handle}`;
}

/** Un lead sin teléfono NI email normalizados no es contactable — se descarta. */
export function hasUsableContact(input: Pick<NormalizedLeadInput, "phone" | "email">): boolean {
  return Boolean(input.phone || input.email);
}

/** Valida forma mínima de email (sin verificar entregabilidad). */
export function normalizeEmail(raw: string | undefined): string | undefined {
  const trimmed = truncate(raw, 254);
  if (!trimmed) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

/**
 * Convierte un resultado crudo de Apify al formato genérico del importador
 * compartido (`NormalizedLeadInput`), aplicando todas las normalizaciones.
 * No filtra por contacto — eso lo decide el llamador con `hasUsableContact`.
 */
export function mapRawPlaceToNormalizedLead(
  place: RawPlace,
  query: LeadHunterQueryConfig,
  batchLabel: string,
): NormalizedLeadInput {
  return {
    companyName: truncate(place.title, 200) ?? "Negocio sin nombre",
    phone: normalizePhone(place.phone, query.country ?? "Colombia"),
    email: normalizeEmail(place.emails?.[0]),
    website: normalizeUrl(place.website),
    city: place.city ?? query.city,
    country: query.country,
    category: query.category,
    address: truncate(place.address, 300),
    rating: place.totalScore,
    reviewsCount: place.reviewsCount,
    instagram: normalizeSocialHandle(place.instagrams?.[0], "instagram"),
    facebook: normalizeSocialHandle(place.facebooks?.[0], "facebook"),
    googleMapsUrl: normalizeUrl(place.url),
    googlePlaceId: truncate(place.placeId, 200),
    sourceDetail: batchLabel,
  };
}
