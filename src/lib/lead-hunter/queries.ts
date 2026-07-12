/**
 * Lista configurable de búsquedas del Lead Hunter.
 *
 * A propósito NO vive dentro de la función principal del orquestador
 * (`run.ts`) — es un array editable e independiente, para que agregar,
 * quitar o ajustar búsquedas no implique tocar la lógica de negocio.
 *
 * Cada entrada define: la frase de búsqueda que se envía a Apify, una
 * categoría interna (usada por el motor de scoring/recomendación existente
 * — reutiliza las mismas palabras clave que ya reconoce
 * `src/lib/scoring.ts` y `src/lib/recommendation.ts`), y opcionalmente una
 * ciudad/país específicos cuando la búsqueda apunta a un barrio conocido.
 */

export type LeadHunterQueryConfig = {
  /** Identificador estable para logs y auditoría (no cambia si se edita el label). */
  id: string;
  /** Frase de búsqueda tal como se envía a Apify (searchStringsArray). */
  searchString: string;
  /** Categoría interna — alimenta scoring y recomendación de servicio. */
  category: string;
  /** Ciudad de la búsqueda. Si se omite, se usa LEAD_HUNTER_CITY. */
  city?: string;
  /** País de la búsqueda. Si se omite, se usa LEAD_HUNTER_COUNTRY. */
  country?: string;
  /** Máximo de resultados a pedirle a Apify para esta búsqueda puntual. */
  maxResults?: number;
};

/**
 * Búsquedas iniciales (turismo/gastronomía/bienestar en Medellín, como pide
 * la primera fase de este módulo). Editable libremente: agrega, comenta o
 * quita entradas sin tocar `run.ts`.
 */
export const DEFAULT_LEAD_HUNTER_QUERIES: LeadHunterQueryConfig[] = [
  { id: "hoteles-boutique-medellin", searchString: "hoteles boutique en Medellín", category: "Hoteles pequeños" },
  { id: "hostales-poblado", searchString: "hostales en El Poblado, Medellín", category: "Hostales" },
  { id: "hostales-laureles", searchString: "hostales en Laureles, Medellín", category: "Hostales" },
  { id: "tour-operadores-medellin", searchString: "tour operadores Medellín", category: "Negocios turísticos" },
  { id: "experiencias-turisticas-medellin", searchString: "experiencias turísticas Medellín", category: "Negocios turísticos" },
  { id: "tours-comuna-13", searchString: "tours Comuna 13, Medellín", category: "Negocios turísticos" },
  { id: "coffee-tours-medellin", searchString: "coffee tours Medellín", category: "Negocios turísticos" },
  { id: "cafes-especialidad-poblado", searchString: "cafés de especialidad en El Poblado, Medellín", category: "Cafés" },
  { id: "restaurantes-provenza", searchString: "restaurantes en Provenza, Medellín", category: "Restaurantes" },
  { id: "restaurantes-manila", searchString: "restaurantes en Manila, Medellín", category: "Restaurantes" },
  { id: "spas-poblado", searchString: "spas en El Poblado, Medellín", category: "Spas y centros de estética" },
  { id: "spas-laureles", searchString: "spas en Laureles, Medellín", category: "Spas y centros de estética" },
  { id: "experiencias-locales-medellin", searchString: "experiencias locales Medellín", category: "Negocios turísticos" },
  { id: "turismo-naturaleza-medellin", searchString: "turismo de naturaleza Medellín", category: "Negocios turísticos" },
];

const DEFAULT_MAX_RESULTS_PER_QUERY = 8;

/**
 * Devuelve la lista de búsquedas resuelta: aplica ciudad/país por defecto
 * (variables de entorno) a las entradas que no especifican uno propio, y
 * limita `maxResults` por consulta.
 */
export function getLeadHunterQueries(): Required<LeadHunterQueryConfig>[] {
  const defaultCity = process.env.LEAD_HUNTER_CITY || "Medellín";
  const defaultCountry = process.env.LEAD_HUNTER_COUNTRY || "Colombia";

  return DEFAULT_LEAD_HUNTER_QUERIES.map((query) => ({
    id: query.id,
    searchString: query.searchString,
    category: query.category,
    city: query.city ?? defaultCity,
    country: query.country ?? defaultCountry,
    maxResults: query.maxResults ?? DEFAULT_MAX_RESULTS_PER_QUERY,
  }));
}
