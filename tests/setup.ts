import { config } from "dotenv";

config();

/**
 * Nunca se debe llamar a Apify u OpenAI reales desde la suite de pruebas.
 * `searchGoogleMaps` y `enrichLeadWithAI` ya caen a modo mock/deshabilitado
 * cuando faltan estas variables — se fuerza aquí para que ningún `.env`
 * local con credenciales reales pueda hacer que un test golpee la API real.
 * Los tests que necesitan probar el camino "IA configurada" mockean
 * explícitamente el paquete `openai`, nunca la red real.
 */
delete process.env.APIFY_TOKEN;
delete process.env.OPENAI_API_KEY;

process.env.CRON_SECRET ??= "test-cron-secret";
process.env.JWT_SECRET ??= "test-jwt-secret";
