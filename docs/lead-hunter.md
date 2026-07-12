# Lead Hunter — captura automática diaria de prospectos

Módulo que busca, normaliza, enriquece con IA y guarda prospectos reales todos
los días sin depender de ChatGPT, ejecución manual, ni CSV. Corre vía Vercel
Cron y queda visible en el dashboard (`/lead-hunter`).

## 1. Arquitectura

```
Vercel Cron (13:00 UTC)
   → GET /api/cron/lead-hunter  (valida CRON_SECRET)
      → src/lib/lead-hunter/run.ts  (orquestador)
         1. candado de concurrencia (LeadHunterExecution)
         2. 14 búsquedas configuradas, en paralelo (Apify Google Maps)
         3. normalización (teléfono E.164, URLs, redes)
         4. filtro: solo se conservan resultados con teléfono O email
         5. enriquecimiento con IA (OpenAI, opcional — nunca bloqueante)
         6. src/lib/lead-import.ts → importLeadBatch()
            (el mismo importador que usa el CSV: dedupe, scoring,
            recomendación, creación, notas)
         7. se cierra la ejecución con métricas + se envía email de resumen
```

Piezas nuevas, todas bajo `src/lib/lead-hunter/`:

| Archivo | Responsabilidad |
|---|---|
| `queries.ts` | Las 14 búsquedas configurables (editar aquí, no en `run.ts`) |
| `apify-client.ts` | Llamada HTTP a Apify + modo mock sin `APIFY_TOKEN` |
| `normalize.ts` | Teléfono→E.164, URLs, redes sociales, filtro de contacto |
| `ai-enrichment.ts` | Enriquecimiento con OpenAI, salida validada con Zod, nunca lanza |
| `run.ts` | Orquestador: candado, ejecución, métricas, notificación |
| `notify.ts` | Email de resumen (Resend) |

El importador compartido (`src/lib/lead-import.ts`) es usado por **tres**
caminos: el CSV (`src/lib/csv-import.ts`), el Lead Hunter legado de búsqueda
manual puntual (`src/lib/apify.ts`, sigue funcionando igual que antes) y el
Lead Hunter automático nuevo. Ningún camino duplica la lógica de
validación/dedupe/scoring.

## 2. Variables de entorno

Ninguna es opcional en producción real, salvo donde se indica:

```bash
APIFY_TOKEN=""                  # sin esto, corre en modo mock (datos de prueba)
APIFY_GOOGLE_MAPS_ACTOR_ID="compass~crawler-google-places"
CRON_SECRET="..."               # ya existe si usas /api/jobs
LEAD_HUNTER_ENABLED="true"      # "false" desactiva el cron sin tocar vercel.json
LEAD_HUNTER_DAILY_LIMIT="20"    # tope de leads NUEVOS creados por día
LEAD_HUNTER_CITY="Medellín"
LEAD_HUNTER_COUNTRY="Colombia"
LEAD_HUNTER_TIMEZONE="America/Bogota"
OPENAI_API_KEY=""               # opcional: sin esto, solo motor de reglas
OPENAI_MODEL="gpt-4o-mini"      # opcional, revisa el catálogo vigente de OpenAI
RESEND_API_KEY=""               # opcional: sin esto, no se envía el email de resumen
LEAD_HUNTER_NOTIFICATION_EMAIL="" # a quién le llega el resumen
LEAD_HUNTER_FROM_EMAIL="Dos Nodos CRM <notificaciones@dosnodos.com.co>"
```

**Nunca** se exponen al frontend, a los logs ni al repo. El endpoint manual
(`/api/admin/lead-hunter/run`) y el dashboard nunca reciben ni muestran estos
valores — solo métricas (conteos, fechas, estados).

## 3. Configurar Apify

1. Crea cuenta en [apify.com](https://apify.com) y copia tu token
   (Settings → Integrations).
2. El actor por defecto es `compass~crawler-google-places` (Google Maps
   Scraper) — no necesitas crear nada, ya existe en el Apify Store.
3. Pon `APIFY_TOKEN` en Vercel (Settings → Environment Variables). Sin él, el
   Lead Hunter sigue funcionando en **modo mock** (útil para probar el
   pipeline completo sin gastar crédito).
4. Costo: cada corrida hace hasta 14 búsquedas × `maxResults` (8 por
   defecto, editable en `queries.ts`) = hasta 112 lugares consultados/día.
   Ajusta `maxResults` por búsqueda o `LEAD_HUNTER_DAILY_LIMIT` si el costo
   de Apify es alto.

## 4. Configurar el cron de Vercel

Ya está declarado en `vercel.json`:

```json
{ "path": "/api/cron/lead-hunter", "schedule": "0 13 * * *" }
```

13:00 UTC = 8:00 a.m. Colombia. Vercel llama automáticamente con
`Authorization: Bearer $CRON_SECRET` — no hay que configurar nada más en el
panel de Vercel más allá de definir la variable de entorno.

> ⚠️ **Límite de Hobby: 60s por función.** Las 14 búsquedas corren en
> paralelo (no en secuencia) para acercar el tiempo total al de la búsqueda
> más lenta, pero un actor de Apify "en frío" puede tardar 100–160s por
> búsqueda real. Con `APIFY_TOKEN` configurado en Hobby, es posible que el
> cron corte por timeout antes de terminar todas las búsquedas — la
> ejecución quedaría en un estado parcial y **nunca se queda colgada en
> RUNNING para siempre** (ver §7), pero puede reportar menos resultados de
> los esperados. Opciones si esto ocurre en producción: reducir
> `maxResults`/número de búsquedas en `queries.ts`, o subir a Vercel Pro
> (300s). Ver también `LEAD_HUNTER_PLAN.md` (§ riesgos).

## 5. Ejecución manual desde el dashboard

En `/lead-hunter` (rol ADMIN), botón **"Ejecutar ahora"**. Llama a
`POST /api/admin/lead-hunter/run` — nunca al cron directamente. Reglas:

- Requiere sesión + rol `ADMIN`.
- Máximo 1 ejecución por minuto (protección de costo/abuso).
- Comparte el mismo candado de concurrencia que el cron: si ya hay una
  ejecución en curso, no se inicia una nueva.

## 6. Ejecución manual por línea de comandos (sin UI)

```bash
# Local, con el server corriendo (npm run dev) y CRON_SECRET en .env:
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/lead-hunter

# Producción:
curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/lead-hunter
```

Respuesta esperada:

```json
{
  "success": true,
  "executionId": "...",
  "queriesExecuted": 14,
  "rawResults": 100,
  "validResults": 40,
  "created": 20,
  "duplicates": 15,
  "invalid": 5,
  "failed": 0,
  "startedAt": "...",
  "finishedAt": "..."
}
```

## 7. Pruebas locales

```bash
npm install
npx prisma migrate dev     # aplica las migraciones de Lead Hunter
npm run db:seed            # usuarios de prueba (admin@dosnodos.com.co / dosnodos2026)
npm run dev

# Sin APIFY_TOKEN ni OPENAI_API_KEY en .env → corre 100% en modo mock/reglas,
# sin gastar crédito ni llamar servicios reales.
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/lead-hunter
```

Suite automatizada (mockea Apify/OpenAI, usa la BD Postgres real de dev para
probar dedupe/concurrencia — nunca llama servicios externos reales):

```bash
npm run test
```

Cubre: normalización de teléfono/email, deduplicación en lote y contra BD,
persistencia de `SIN_CONSENTIMIENTO`, fallback cuando la IA falla, rechazo de
cron sin `CRON_SECRET`, candado de concurrencia (incluida la auto-sanación de
ejecuciones huérfanas), rechazo del endpoint manual sin rol ADMIN,
compatibilidad del importador de CSV, cálculo de métricas e idempotencia.

## 8. Consentimiento y cumplimiento

- Todo lead capturado entra con `consentStatus = SIN_CONSENTIMIENTO` —
  **nunca** se le envía WhatsApp automáticamente (el guard de
  `src/lib/compliance.ts` lo bloquea hasta que exista opt-in trazable).
- Solo se usan datos **públicos** de Google Maps (nombre, teléfono/email
  publicados, sitio web, redes, rating, reseñas). Nunca se hace scraping de
  datos privados ni se visita el sitio web del negocio desde el servidor
  (evita SSRF por diseño, no por validación).
- El mensaje sugerido por IA (`outreachMessage`) se guarda como nota interna
  para revisión humana — **nunca se envía automáticamente** ni cambia el
  estado de consentimiento.
- La IA nunca afirma haber hecho una auditoría exhaustiva, no inventa
  problemas ni promete resultados garantizados (reglas explícitas en el
  prompt de `ai-enrichment.ts`).

## 9. Diagnóstico de errores

| Síntoma | Dónde mirar | Causa probable |
|---|---|---|
| El cron responde 401 | — | `CRON_SECRET` no coincide o no está configurado en Vercel |
| `alreadyRunning: true` inesperado | `/lead-hunter`, columna Estado | Una ejecución sigue `RUNNING`; si tiene más de 10 min, se auto-marca `FAILED` en la siguiente corrida |
| `status: FAILED` con `errorSummary` | Tabla de historial, columna Estado (tooltip) | Ver el resumen del error (secretos ya redactados); revisar también `/logs` (`lead_hunter.execution.failed`) |
| `created: 0` repetidamente | Métricas de la ejecución | Puede ser normal: `LEAD_HUNTER_DAILY_LIMIT` del día ya alcanzado, o todos los resultados eran duplicados/sin contacto |
| No llega el email de resumen | `/logs` (`lead_hunter.notify.*`) | Falta `RESEND_API_KEY` o `LEAD_HUNTER_NOTIFICATION_EMAIL`, o el dominio remitente no está verificado en Resend |
| `aiObservations` vacío en los leads nuevos | — | Normal sin `OPENAI_API_KEY` — el lead se crea igual con la recomendación por reglas |

## 10. Rollback

- **Desactivar sin desplegar código**: pon `LEAD_HUNTER_ENABLED="false"` en
  Vercel y redeploy (o solo la env var si tu plan permite runtime env sin
  rebuild) — el cron sigue llamando pero la ejecución se cierra de
  inmediato sin buscar nada, y queda registrada como `SUCCESS` con métricas
  en cero.
- **Quitar el cron por completo**: elimina la entrada
  `/api/cron/lead-hunter` de `vercel.json` y redeploy. `daily-all` no se ve
  afectado.
- **Revertir el código**: el módulo es aditivo — no modifica el modelo
  `Lead` de forma incompatible (solo agrega columnas nullable
  `googlePlaceId`/`leadHunterExecutionId`) ni cambia el comportamiento del
  CSV o del Lead Hunter legado. Revertir los commits de este módulo no
  requiere una migración de "bajada" para que el resto del CRM siga
  funcionando; sí se perdería el historial en `lead_hunter_executions` si
  además se revierte la migración correspondiente (no recomendado si ya
  hay datos).
- **Pausar sin tocar nada**: no crear/renovar `CRON_SECRET` o quitar
  `APIFY_TOKEN` también detiene la captura (cae a modo mock), aunque el
  cron seguiría corriendo — usa `LEAD_HUNTER_ENABLED="false"` para un
  apagado limpio y explícito.

## 11. Exportar el lote de una ejecución (respaldo CSV)

El flujo principal trabaja con la base de datos, no con CSV. Para
auditoría/respaldo puntual, cada fila del historial en `/lead-hunter` tiene
un enlace **Descargar** que exporta los leads de esa ejecución con las
columnas: `nombre_negocio,nombre_contacto,telefono,email,sitio_web,ciudad,
pais,categoria,direccion,rating,resenas,instagram,facebook,google_maps_url,
notas,fuente_detalle`.
