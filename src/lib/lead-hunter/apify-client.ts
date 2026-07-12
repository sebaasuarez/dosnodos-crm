/**
 * Cliente de bajo nivel para el actor de Google Maps de Apify.
 *
 * Extraído de `src/lib/apify.ts` (el Lead Hunter legado de búsqueda manual)
 * para que tanto ese flujo legado como el nuevo orquestador de
 * `src/lib/lead-hunter/run.ts` reutilicen la misma llamada HTTP y el mismo
 * modo simulado — evita mantener dos implementaciones del mismo cliente.
 *
 * Con APIFY_TOKEN configurado, ejecuta el actor real (run-sync-get-dataset-items).
 * Sin token, corre en modo mock: genera negocios realistas para poder probar
 * el pipeline completo sin gastar crédito de Apify.
 */

export type RawPlace = {
  title: string;
  categoryName?: string;
  address?: string;
  city?: string;
  countryCode?: string;
  phone?: string;
  website?: string;
  url?: string; // Google Maps URL
  placeId?: string; // Apify: place_id / placeId del negocio en Google Maps
  totalScore?: number;
  reviewsCount?: number;
  openingHours?: { day: string; hours: string }[];
  emails?: string[];
  instagrams?: string[];
  facebooks?: string[];
};

export type ApifySearchInput = {
  searchString: string;
  city: string;
  country: string;
  maxResults?: number;
};

const APIFY_BASE = "https://api.apify.com/v2";
const REQUEST_TIMEOUT_MS = 55_000; // margen bajo el techo de 60s de Vercel Hobby
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

export function apifyActorId(): string {
  return process.env.APIFY_GOOGLE_MAPS_ACTOR_ID ?? "compass~crawler-google-places";
}

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Determina si vale la pena reintentar (errores transitorios: red, 429, 5xx). */
function isRetryable(err: unknown, status?: number): boolean {
  if (status !== undefined) return status === 429 || status >= 500;
  return err instanceof Error && /network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(err.message);
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok && isRetryable(null, res.status) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Apify request failed");
}

/** Llama al actor real de Apify de forma síncrona (espera el dataset completo). */
export async function runApifySearch(input: ApifySearchInput): Promise<RawPlace[]> {
  const token = process.env.APIFY_TOKEN;
  const body = {
    searchStringsArray: [input.searchString],
    locationQuery: `${input.city}, ${input.country}`,
    maxCrawledPlacesPerSearch: input.maxResults ?? 10,
    language: "es",
    scrapeContacts: true,
  };
  const res = await fetchWithRetry(
    `${APIFY_BASE}/acts/${encodeURIComponent(apifyActorId())}/run-sync-get-dataset-items?token=${token}&timeout=50`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as RawPlace[];
}

// ── Modo mock (sin APIFY_TOKEN) ─────────────────────────────────
const MOCK_NAMES = [
  "El Buen Sabor", "Donde Marta", "La Esquina", "Punto Clave", "Rincón Paisa",
  "Casa Central", "El Portal", "Estrella Dorada", "Nuevo Horizonte", "La Colina",
];

export function mockApifySearch(input: ApifySearchInput): RawPlace[] {
  const count = Math.min(input.maxResults ?? 8, 8);
  return Array.from({ length: count }, (_, i) => {
    const hasWebsite = Math.random() > 0.6;
    const hasSocial = Math.random() > 0.4;
    const seed = Math.random().toString(36).slice(2, 8);
    const words = input.searchString.split(" ").slice(0, 2).join(" ");
    return {
      title: `${words} ${MOCK_NAMES[i % MOCK_NAMES.length]}`,
      categoryName: input.searchString,
      address: `Calle ${10 + i} # ${20 + i}-${30 + i}, ${input.city}`,
      city: input.city,
      countryCode: "CO",
      phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`,
      website: hasWebsite ? `https://negocio-${seed}.negocio.site` : undefined,
      url: `https://maps.google.com/?cid=mock-${seed}`,
      placeId: `mock-place-${seed}`,
      totalScore: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      reviewsCount: Math.floor(Math.random() * 200),
      emails: Math.random() > 0.7 ? [`contacto@negocio-${seed}.co`] : [],
      instagrams: hasSocial ? [`https://instagram.com/negocio_${seed}`] : [],
      facebooks: [],
    };
  });
}

/** Punto de entrada único: decide modo real/mock según APIFY_TOKEN. */
export async function searchGoogleMaps(input: ApifySearchInput): Promise<RawPlace[]> {
  return isApifyConfigured() ? runApifySearch(input) : mockApifySearch(input);
}
