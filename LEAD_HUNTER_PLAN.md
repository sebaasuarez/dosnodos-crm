# Lead Hunter productivo — Diagnóstico y plan de implementación

> Fase 1 de 6. Este documento se escribe **antes** de tocar código, por
> requerimiento explícito. Cubre: diagnóstico del repo, arquitectura
> propuesta, archivos a crear/modificar, riesgos (incluye un conflicto real
> de plataforma que hay que resolver a propósito) y el plan de las 5 fases
> restantes.

---

## 1. Diagnóstico del repositorio

### 1.1 Framework y versión

- **Next.js 15.5.20** (App Router, `src/app/`), React 19, TypeScript 5.7 estricto.
- Build: `prisma generate && next build`. `next.config.ts` tiene `output: "standalone"`
  y `eslint: { ignoreDuringBuilds: true }` (no hay ESLint configurado como gate de CI
  hoy — lo confirmo en el diagnóstico de Fase 6, ver §7).
- Desplegado en **Vercel** (plan **Hobby**, confirmado empíricamente esta sesión:
  máximo 2 cron jobs con ejecución diaria, funciones serverless con techo duro de
  **60 segundos** — ver §5, riesgo crítico).

### 1.2 ORM y base de datos

- **Prisma 6.2.1** contra **PostgreSQL** (Supabase en producción, `us-east-1`,
  vía pooler `pgbouncer`). Local dev usa Postgres nativo.
- Migraciones en `prisma/migrations/`, aplicadas en prod vía la API de administración
  de Supabase (no hay conectividad TCP directa desde este entorno de desarrollo,
  solo HTTPS — documentado en `docs/DEPLOYMENT.md`).

### 1.3 Modelo actual de leads (`prisma/schema.prisma`)

`model Lead` (línea 85) — campos relevantes para este trabajo:

| Campo actual | Uso |
|---|---|
| `companyName, contactName, phone, email, website, address, city, country, category` | datos base del negocio |
| `source: LeadSourceType` | enum: `APIFY_GOOGLE_MAPS, LANDING_FORM, CLICK_TO_WHATSAPP, WHATSAPP_INBOUND, QR, ANUNCIO, REFERIDO, MANUAL, CSV_IMPORT` — **falta `LEAD_HUNTER`** |
| `sourceDetail, sourceUrl` | trazabilidad de lote/origen |
| `googleMapsUrl` (`@unique`) | **no existe `googlePlaceId`** — hay que añadirlo |
| `rating, reviewsCount, socialMedia (Json), openingHours` | señales del negocio |
| `hasWebsite, hasWhatsapp, hasEmail, hasSocialMedia` | señales digitales calculadas |
| `digitalOpportunitySummary, recommendedService, recommendedPackage, aiObservations, score, scoreBreakdown` | oportunidad + scoring (`aiObservations` existe pero no se usa hoy — es el lugar natural para el `outreachMessage`/`opportunityReason` de la IA) |
| `status: LeadStatus` (17 valores), `consentStatus: ConsentStatus` (`SIN_CONSENTIMIENTO/PENDIENTE/OPT_IN/OPT_OUT`) | pipeline y cumplimiento |
| `notes: Note[]` (relación 1-N) | notas internas, no una columna |

`model LeadScore` — historial de scoring (1 fila por recálculo).
`model ApifyRun` (línea 479) — **ya existe** un tracker de ejecuciones de Apify:
`id, actorId, runId, status (EN_EJECUCION/COMPLETADO/FALLIDO), input Json, totalResults,
newLeads, duplicates, error, startedAt, finishedAt`. Es del MVP original (búsqueda
manual por ciudad/categoría única). **Se reutiliza** como tabla de sub-ejecuciones
por consulta (ver §3.3), en vez de crear una tabla redundante.

### 1.4 Endpoint actual `POST /api/public/leads-import`

`src/app/api/public/leads-import/route.ts` — público, protegido con header
`x-import-token` == `CSV_IMPORT_TOKEN`. Acepta CSV crudo (`text/csv`) o
`{csv, batchLabel}` (JSON). Llama a `parseLeadsCsv` + `importLeads` de
`src/lib/csv-import.ts`. Está en `PUBLIC_PATHS` del middleware (bypassa la sesión).

### 1.5 Servicio existente de importación CSV

- **`src/lib/csv-parse.ts`** (puro, sin Prisma — seguro para el bundle de cliente):
  `parseCsv` (parser RFC4180 con comillas/comas/saltos de línea), `parseLeadsCsv`
  (valida `nombre_negocio` obligatorio + al menos `telefono`/`email`), `CSV_COLUMNS`,
  `CSV_TEMPLATE`, tipo `ParsedLeadRow`.
- **`src/lib/csv-import.ts`** (con Prisma): `importLeads(rows, {authorId, batchLabel})`:
  1. Carga settings de scoring **una vez** (`loadScoreSettings()`).
  2. Deduplicación **en lote** (una sola query `findMany` con `OR` de `phone in [...]`,
     `email in [...]`, `companyName in [...]`, luego cruce en memoria con `city`).
  3. Calcula score (`computeScore`, puro) y recomendación (`recommendService`, puro)
     **en memoria**, sin queries por fila.
  4. Inserta con `createMany` en bloques de 500 (`leads`, `lead_scores`, `notes`).
  5. Audita el resultado.

  Esta es exactamente la base que el enunciado pide generalizar en
  `importLeadBatch({leads, source, batchLabel, executionId})` — **no hay que
  reescribir el algoritmo, hay que parametrizar `source` (hoy hardcodeado a
  `"CSV_IMPORT"`) y añadir `executionId`** (nuevo, para vincular leads a su
  ejecución de Lead Hunter).

### 1.6 Reglas actuales de deduplicación

Dos implementaciones **distintas** hoy (justo el tipo de duplicación de lógica
que el enunciado pide eliminar):

1. **`csv-import.ts`** — en lote (arriba). Compara por `phone`, `email`,
   `companyName+city` (case-insensitive). **No compara por `googleMapsUrl`.**
2. **`apify.ts` → `runLeadHunter`** — **por fila** (`findFirst` dentro del loop):
   compara por `googleMapsUrl`, `phone`, o `companyName+city`. Esto es el origen
   del problema de rendimiento N+1 que causó el timeout de Vercel visto esta sesión
   con búsquedas reales de Apify.

**Plan:** la nueva `importLeadBatch` unifica ambos criterios (`phone`, `email`,
`companyName+city`, **y `googleMapsUrl`/`googlePlaceId`**) en una sola query en lote,
y pasa a ser la única implementación.

### 1.7 Cálculo de score

`src/lib/scoring.ts` — **ya refactorizado** esta sesión en dos capas:
- `loadScoreSettings()`: una query async a `Setting` (pesos + umbrales).
- `computeScore(lead, settings)`: función **pura**, sin BD — apta para lotes grandes.
- `scoreLead(lead)`: wrapper de conveniencia (`loadScoreSettings` + `computeScore`)
  para un solo lead (usado por `enrichLead` del `apify.ts` legado y el botón
  "Recalcular score" del detalle de lead).

No requiere cambios — se reutiliza tal cual desde `importLeadBatch` y desde el
nuevo Lead Hunter.

### 1.8 Generación de recomendaciones

`src/lib/recommendation.ts` → `recommendService(lead): {service, packageName, reason}`.
Pura, basada en reglas (categoría + señales digitales). Se reutiliza sin cambios
como **fallback** cuando la IA no está disponible o falla — exactamente lo que pide
el enunciado ("si falla la IA, el lead debe poder guardarse con una recomendación
basada en reglas").

### 1.9 Manejo de notas

`model Note { id, leadId, authorId?, content, createdAt }`, relación 1-N con `Lead`.
`csv-import.ts` crea una `Note` por fila si viene la columna `notas`. Se reutiliza:
el `mensajeSugerido`/`opportunityReason` de la IA se guardará como `Note` adicional
(no solo en el campo `aiObservations` del lead, para que quede en el timeline visible
del detalle del lead, igual que las notas del CSV).

### 1.10 Estados de consentimiento de WhatsApp

`enum ConsentStatus { SIN_CONSENTIMIENTO, PENDIENTE, OPT_IN, OPT_OUT }`. El guard
central (`src/lib/compliance.ts` → `checkCanSendWhatsApp`) bloquea cualquier envío
si `consentStatus !== OPT_IN` y no hay ventana de 24h abierta. **Todo lo que entra
por Lead Hunter y CSV ya usa `SIN_CONSENTIMIENTO`** — el nuevo módulo no cambia esta
regla, solo la hereda (`importLeadBatch` la fija igual que `csv-import.ts` hoy).

### 1.11 Sistema de autenticación y roles

- `src/lib/auth.ts`: JWT en cookie httpOnly (`jose`), `SessionUser {id,name,email,role}`,
  `UserRole` = `ADMIN | COMERCIAL | MARKETING | LECTURA`.
- `src/lib/api.ts`: `requireApiSession(roles?)` (valida cookie + rol opcional),
  `requireCronSecret(request)` (compara `x-cron-secret` o `Authorization: Bearer`
  contra `process.env.CRON_SECRET` — **coincide exactamente con lo que pide el
  enunciado para `/api/cron/lead-hunter`**, se reutiliza tal cual).
- `src/middleware.ts`: `PUBLIC_PATHS` (rutas exactas sin sesión) y
  `PUBLIC_PREFIXES` (hoy solo `/api/jobs/`) — **hay que añadir `/api/cron/`** a los
  prefijos públicos (el propio endpoint valida `CRON_SECRET`, pero el middleware
  lo bloquearía antes si no se excluye, igual que ya pasa con `/api/jobs/`).

### 1.12 Componentes actuales del dashboard

- Layout: `src/app/(dashboard)/layout.tsx` + `src/components/sidebar.tsx` (nav fija).
- `/lead-hunter` (`src/app/(dashboard)/lead-hunter/page.tsx`): página **legada** del
  MVP — formulario de búsqueda manual (`HunterForm`, ciudad+categoría única) +
  historial de `ApifyRun`. **Se reemplaza el contenido de esta página** por el nuevo
  panel de administración (mismo nombre/ruta que pide el enunciado: "sección de
  administración llamada Lead Hunter"), conservando el formulario manual legado como
  herramienta secundaria de prueba rápida (no se elimina funcionalidad, se reordena).
- Componentes reutilizables: `src/components/charts.tsx` (`MetricCard`, `FunnelBars`,
  `BarChart`), `src/components/client-actions.tsx`, `src/components/forms.tsx`
  (client components con `"use client"`, patrón `fetch` + `router.refresh()`).
- `src/lib/jobs.ts`: job `"lead-discovery"` (parte de `daily-all`) llama a
  `runLeadHunter` con rotación diaria determinista de 1 ciudad/categoría — **se
  retira de la secuencia `daily-all`** (ver §5, decisión justificada) porque el
  nuevo cron de Lead Hunter asume ese propósito de forma más completa
  (múltiples búsquedas configurables en vez de una sola por rotación).

### 1.13 Qué NO existe hoy (hay que construirlo)

- Cliente/proveedor de IA con **OpenAI** (el proyecto usa `@anthropic-ai/sdk` para
  el asistente conversacional de WhatsApp — `src/lib/ai.ts` — pero el enunciado de
  este módulo pide explícitamente `OPENAI_API_KEY`, un proveedor distinto. Ver
  decisión en §4.4).
- Cliente de email (Resend). No hay ningún envío de correo en el proyecto hoy.
- Suite de pruebas automatizadas — **no hay ningún framework de testing instalado**
  (sin `vitest`/`jest` en `package.json`, sin carpeta `__tests__`). Se añade en Fase 6.
- Rate limiting de cualquier tipo (no existe infraestructura de rate limit hoy).
- `vercel.json` solo tiene 1 cron (`daily-all`, 12:00 UTC).

---

## 2. Decisión de reutilización (no duplicar lógica)

| Pieza | Reutilizar tal cual | Extraer/generalizar | Nuevo |
|---|---|---|---|
| Deduplicación + scoring + creación en lote | — | `csv-import.ts:importLeads` → `lead-import.ts:importLeadBatch` (genérico) | — |
| Llamada HTTP a Apify + modo mock | — | `apify.ts:runApifyActor/mockPlaces` → `apify-client.ts` (reutilizado por el `runLeadHunter` legado y el nuevo Lead Hunter) | Ejecución **concurrente** de N queries |
| Scoring puro | `computeScore`, `loadScoreSettings` | — | — |
| Recomendación por reglas | `recommendService` | — | usado como **fallback** de la IA |
| Guard de cumplimiento | `checkCanSendWhatsApp`, `SIN_CONSENTIMIENTO` fijo | — | — |
| Auth/roles/cron-secret | `requireApiSession`, `requireCronSecret` | — | — |
| Notas | `model Note` | — | — |
| Historial de ejecuciones | `model ApifyRun` (como sub-ejecución por query) | añadir FK `leadHunterExecutionId` | `model LeadHunterExecution` (padre) |
| IA | — | — | `openai` SDK nuevo, módulo `ai-enrichment.ts` |
| Email | — | — | `resend` SDK nuevo, módulo `notify.ts` |

---

## 3. Arquitectura propuesta

```
GET /api/cron/lead-hunter  (CRON_SECRET)         POST /api/admin/lead-hunter/run (sesión ADMIN)
        │                                                    │
        └──────────────────┬─────────────────────────────────┘
                            ▼
                  src/lib/lead-hunter/run.ts
                  runLeadHunterExecution(triggerType)
                            │
        1. Lock de concurrencia (¿hay LeadHunterExecution RUNNING?)
        2. crea LeadHunterExecution (RUNNING, triggerType)
        3. para cada query configurada (src/lib/lead-hunter/queries.ts):
             crea ApifyRun (sub-ejecución, FK a LeadHunterExecution)
             ejecuta EN PARALELO (Promise.allSettled) ──► apify-client.ts
        4. normaliza resultados        ──► normalize.ts (teléfono, URLs, redes)
        5. filtra sin teléfono/email
        6. dedupe intra-lote + enriquece con IA (o fallback) ──► ai-enrichment.ts
        7. importLeadBatch({leads, source:"LEAD_HUNTER", batchLabel, executionId})
                            │            (src/lib/lead-import.ts — dedupe BD, score,
                            │             recomendación, createMany, notas)
        8. finaliza LeadHunterExecution (SUCCESS/PARTIAL/FAILED + métricas)
        9. notify.ts → email de resumen (Resend)
```

### 3.1 Nuevos módulos (`src/lib/lead-hunter/`)

| Archivo | Responsabilidad |
|---|---|
| `queries.ts` | Lista configurable de búsquedas (las 14 del enunciado + ciudad/país por env). Array editable, no hardcodeado en la función principal. |
| `apify-client.ts` | Llamada HTTP a Apify (real/mock), **extraída** de `apify.ts`. Un query = una promesa; el orquestador las lanza con `Promise.allSettled`. |
| `normalize.ts` | Normalización de teléfono a E.164 (Colombia por defecto), normalización de URLs/handles de redes, mapeo `RawPlace → NormalizedLeadInput`. |
| `ai-enrichment.ts` | Llamada a OpenAI con salida estructurada (JSON Schema) + validación Zod, timeout + reintento con backoff, fallback a `recommendService` + plantilla de mensaje si falla o si `OPENAI_API_KEY` no está configurada. |
| `run.ts` | Orquestador: lock de concurrencia, ejecución, agregación de métricas, finalización, notificación. |
| `notify.ts` | Cliente Resend + armado del correo de resumen (sin secretos). |

### 3.2 `src/lib/lead-import.ts` (generalización de `csv-import.ts`)

```ts
type NormalizedLeadInput = {
  companyName: string; contactName?: string; phone?: string; email?: string;
  website?: string; city?: string; country?: string; category?: string;
  address?: string; rating?: number; reviewsCount?: number;
  instagram?: string; facebook?: string; googleMapsUrl?: string; googlePlaceId?: string;
  notes?: string; sourceDetail?: string;
  // Campos opcionales que, si vienen, SOBRESCRIBEN el cálculo por reglas
  // (los usa el Lead Hunter cuando la IA respondió con éxito):
  aiOpportunityReason?: string; aiRecommendedOffer?: string; aiOutreachMessage?: string;
};

export async function importLeadBatch(options: {
  leads: NormalizedLeadInput[];
  source: LeadSourceType;         // "CSV_IMPORT" | "LEAD_HUNTER" | futuros
  batchLabel?: string;
  executionId?: string;           // FK opcional a LeadHunterExecution
  authorId?: string;
}): Promise<ImportSummary>
```

`csv-import.ts` queda como wrapper: `parseLeadsCsv` (sin cambios) →
`importLeadBatch({leads: rows, source: "CSV_IMPORT", ...})`. **El endpoint
`POST /api/public/leads-import` y el formulario del dashboard no cambian su
contrato** — mismo `ImportSummary` de respuesta.

### 3.3 Persistencia de ejecuciones — reutilizando `ApifyRun`

En vez de crear una tabla redundante para "una fila por consulta ejecutada",
se añade una FK nullable `leadHunterExecutionId` a `ApifyRun` (que ya tiene
`actorId, runId, status, input, totalResults, newLeads, duplicates, error,
startedAt, finishedAt` — exactamente lo que necesita una sub-ejecución por
query). El `runLeadHunter` legado sigue creando `ApifyRun` sin
`leadHunterExecutionId` (null) — no rompe nada existente.

`LeadHunterExecution` (nuevo, el padre — 1 por corrida del cron/manual):

```prisma
enum LeadHunterExecutionStatus { RUNNING SUCCESS PARTIAL FAILED }
enum LeadHunterTriggerType { CRON MANUAL }

model LeadHunterExecution {
  id              String   @id @default(cuid())
  status          LeadHunterExecutionStatus @default(RUNNING)
  triggerType     LeadHunterTriggerType
  startedAt       DateTime @default(now())
  finishedAt      DateTime?
  queriesExecuted Int      @default(0)
  rawResults      Int      @default(0)
  validResults    Int      @default(0)
  created         Int      @default(0)
  duplicates      Int      @default(0)
  invalid         Int      @default(0)
  failed          Int      @default(0)
  errorSummary    String?
  batchLabel      String?
  metadata        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  apifyRuns ApifyRun[]
  leads     Lead[]

  @@index([status])
  @@index([startedAt])
  @@map("lead_hunter_executions")
}
```

Y en `Lead`: `leadHunterExecutionId String?` + relación — permite el export CSV
"de este lote exacto" sin depender de parsear `sourceDetail`.

Y en `LeadSourceType`: se añade el valor `LEAD_HUNTER` (nuevo; `APIFY_GOOGLE_MAPS`
se conserva para el flujo legado manual, sin overlap).

---

## 4. Decisiones que tomo y por qué (con justificación explícita de cualquier cambio)

### 4.1 El job `lead-discovery` sale de la secuencia `daily-all`

`src/lib/jobs.ts` tiene un job diario que ya llama a Apify (rotación de 1
ciudad/categoría). El nuevo Lead Hunter cubre ese mismo propósito de forma más
completa (14 búsquedas configurables + IA). Mantener ambos correría Apify
**dos veces al día de forma redundante** (gasto de crédito duplicado, dos fuentes
de leads de Google Maps con nombres de `source` distintos para el mismo tipo de
dato). **Se retira `lead-discovery` de `DAILY_SEQUENCE`** — no se borra la función
ni el `apify.ts` legado (sigue disponible para pruebas manuales vía
`POST /api/apify/run` y el formulario en `/lead-hunter`), solo se quita su disparo
automático diario, reemplazado por el cron dedicado nuevo.

### 4.2 `/lead-hunter` se convierte en el panel de administración pedido

Se reescribe el contenido de la página (mismo nombre/ruta), conservando el
formulario de búsqueda manual legado (`HunterForm`) en una sección secundaria
"Búsqueda manual rápida (legado)" — por si sigue siendo útil para pruebas
puntuales de una sola ciudad/categoría sin pasar por la lista completa de queries.

### 4.3 Riesgo crítico de plataforma: Vercel Hobby (60s) vs. 14 búsquedas reales de Apify

**Ya se confirmó empíricamente esta sesión** (ver conversación previa) que UNA
sola búsqueda real de Google Maps Scraper tarda entre 100 y 160 segundos
(cold start del actor con navegador headless) — muy por encima de los 60s que
permite Vercel Hobby, y por encima incluso de una función Pro (300s) si se
ejecutan **secuencialmente**.

**Decisión:** el orquestador ejecuta las N queries configuradas **en paralelo**
(`Promise.allSettled`, no un `for` secuencial) contra Apify, de modo que el
tiempo total de la función ≈ el tiempo de la consulta más lenta (~100-160s),
no la suma de las 14. Esto reduce drásticamente el problema pero **no lo
elimina en Hobby** (60s sigue siendo menor a 100-160s).

**Lo que implemento de todas formas, siendo honesto sobre el límite real:**
- `export const maxDuration = 60` en el endpoint del cron (el máximo permitido
  sin plan Pro — poner un valor mayor en Hobby puede hacer fallar el build/deploy).
- El código, las pruebas y el contrato de respuesta son correctos y completos
  independientemente del plan de Vercel (se prueban con mocks, que sí corren en
  <1s, cumpliendo el JSON de respuesta exacto que pide el enunciado).
- **Para que funcione con Apify real en producción hace falta uno de:**
  (a) subir a **Vercel Pro** (300s) — con ejecución en paralelo, 300s cubre
  cómodamente el peor caso observado (~160s) con margen, o
  (b) reducir el número de queries reales por corrida / bajar `maxResults` por
  query para acortar el tiempo del actor, o
  (c) evolucionar a un modelo asíncrono con webhooks de Apify (fuera de alcance
  de esta entrega — lo documento como trabajo futuro en `docs/lead-hunter.md`,
  ya que añade una superficie considerable: endpoint de webhook, matching de
  ejecuciones parciales, y cambia el contrato de respuesta síncrono que pide
  el enunciado).

  Este mismo dilema ya se lo planteé al usuario en la conversación anterior a
  esta tarea (sin respuesta aún) — lo dejo explícito aquí de nuevo porque ahora
  aplica con más fuerza (14 queries en vez de 1). **No bloqueo la implementación
  por esto** — construyo todo correctamente y dejo la limitación documentada
  con las 3 opciones, tal como pide el enunciado en "riesgos o pendientes".

### 4.4 IA: OpenAI (no Anthropic/Claude) — solo para este módulo

El enunciado especifica explícitamente `OPENAI_API_KEY` como variable de entorno
para el enriquecimiento. El proyecto ya usa `@anthropic-ai/sdk` (Claude) para el
asistente conversacional de WhatsApp (`src/lib/ai.ts`) — son necesidades
distintas y el usuario pidió el proveedor por nombre de variable, así que
implemento el enriquecimiento de Lead Hunter con **OpenAI** (paquete `openai`,
Chat Completions con `response_format: json_schema` + validación Zod), sin tocar
`src/lib/ai.ts`. Diseño la interfaz de `ai-enrichment.ts` de forma que cambiar de
proveedor en el futuro sea un cambio acotado a ese único archivo.

### 4.5 Rate limiting del endpoint manual

No hay infraestructura de rate limit en el proyecto. Implemento control **basado
en BD** (coherente con serverless sin estado compartido): (a) lock duro de
concurrencia — cualquier `LeadHunterExecution` en `RUNNING` bloquea nuevas
ejecuciones (cron o manual), y (b) límite blando para manual — máximo 1
ejecución `MANUAL` cada 5 minutos por instalación, verificado contra
`LeadHunterExecution` reciente antes de crear una nueva.

### 4.6 SSRF — no se visitan sitios web externos

El enunciado pide evitar SSRF "al analizar sitios web". La forma más segura de
cumplir esto es **no hacerlo**: la IA solo recibe metadatos ya devueltos por
Apify (nombre, categoría, ciudad, rating, número de reseñas, si tiene sitio web
o no, la URL como texto) — **nunca se hace un `fetch` al sitio web del negocio**
desde el servidor. Esto se documenta explícitamente en `ai-enrichment.ts` y en
`docs/lead-hunter.md`.

### 4.7 Idempotencia

Se logra con el mismo mecanismo de deduplicación contra BD que ya existe
(teléfono/email/nombre+ciudad/`googleMapsUrl`+`googlePlaceId`) — si el cron
corriera dos veces el mismo día, la segunda corrida encontraría todo como
duplicado. No hace falta una clave de idempotencia separada; el lock de
concurrencia además impide ejecuciones solapadas.

---

## 5. Archivos a crear

```
src/lib/lead-import.ts                          (generaliza csv-import.ts)
src/lib/lead-hunter/queries.ts
src/lib/lead-hunter/apify-client.ts
src/lib/lead-hunter/normalize.ts
src/lib/lead-hunter/ai-enrichment.ts
src/lib/lead-hunter/run.ts
src/lib/lead-hunter/notify.ts
src/app/api/cron/lead-hunter/route.ts
src/app/api/admin/lead-hunter/run/route.ts
src/app/api/admin/lead-hunter/executions/route.ts        (historial, filtros)
src/app/api/admin/lead-hunter/executions/[id]/route.ts   (detalle)
src/app/api/admin/lead-hunter/executions/[id]/export/route.ts (CSV del lote)
prisma/migrations/<ts>_lead_hunter_execution/migration.sql
vitest.config.ts
tests/lead-hunter/normalize.test.ts
tests/lead-hunter/dedupe.test.ts
tests/lead-hunter/ai-enrichment.test.ts
tests/lead-hunter/run.test.ts
tests/lead-hunter/csv-compat.test.ts
tests/setup.ts (mocks de Prisma/fetch)
docs/lead-hunter.md
LEAD_HUNTER_PLAN.md (este archivo)
```

## 6. Archivos a modificar

```
prisma/schema.prisma          (+LeadHunterExecution, +LEAD_HUNTER en enum,
                                +googlePlaceId, +leadHunterExecutionId en Lead y ApifyRun)
src/lib/csv-import.ts         (pasa a wrapper de importLeadBatch)
src/lib/apify.ts              (runLeadHunter usa apify-client.ts + importLeadBatch)
src/lib/jobs.ts               (retira "lead-discovery" de DAILY_SEQUENCE, con comentario)
src/middleware.ts             (+"/api/cron/" a PUBLIC_PREFIXES)
vercel.json                   (+cron lead-hunter, conserva daily-all)
.env.example                  (+9 variables nuevas)
.env                          (dev, valores locales/mock)
src/app/(dashboard)/lead-hunter/page.tsx  (nuevo panel admin)
src/components/forms.tsx      (+botón "Ejecutar ahora", mantiene HunterForm)
package.json                  (+openai, +resend, +vitest y afines como devDeps)
docs/ARCHITECTURE.md          (+endpoints nuevos)
README.md                     (mención del módulo + comando de tests)
```

## 7. Riesgos (resumen para seguimiento)

1. **Timeout de Vercel Hobby vs. Apify real** — ver §4.3. Mitigado con
   ejecución concurrente; requiere decisión del usuario (Pro / reducir alcance /
   async futuro) para funcionar con datos reales en producción.
2. **Costo de Apify + OpenAI** — 14 búsquedas diarias reales consumen crédito de
   Apify; cada enriquecimiento consume tokens de OpenAI. Se documenta control de
   costos: `LEAD_HUNTER_DAILY_LIMIT` topa el total de leads nuevos por corrida,
   y el fallback sin IA evita gasto si `OPENAI_API_KEY` no está seteada.
2b. **Sin ESLint como gate real** (`ignoreDuringBuilds: true`) — "ejecutar lint"
    en los checkpoints de cada fase corre `next lint` informativamente; no hay
    reglas custom configuradas más allá del default de Next.
3. **No existe test runner hoy** — se instala `vitest` (ligero, sin config
   pesada, compatible con TS/ESM de Next 15). Riesgo bajo, cambio aditivo.
4. **Zona horaria del cron** — Vercel Cron usa UTC. `13:00 UTC = 08:00 Bogotá`
   (Colombia no tiene horario de verano, offset fijo UTC-5) — se usa
   directamente `"0 13 * * *"` sin necesidad de conversión en tiempo de
   ejecución; `LEAD_HUNTER_TIMEZONE` se usa solo para mostrar la "próxima
   ejecución estimada" en el dashboard con la etiqueta correcta.
5. **Migración de `LeadSourceType`** (`ALTER TYPE ... ADD VALUE`) no puede
   usarse en la misma transacción que la inserta — ya se resolvió este mismo
   patrón exitosamente esta sesión (migración separada, aplicada vía API de
   Supabase). Mismo procedimiento para `LEAD_HUNTER`.
6. **OpenAI como segundo proveedor de IA** — aumenta la superficie de
   configuración (dos claves de LLM en el proyecto). Aceptado porque el
   enunciado lo pide explícitamente por nombre de variable (ver §4.4).

## 8. Plan de fases restantes (2-6)

| Fase | Entregable | Checkpoint |
|---|---|---|
| 2 | `lead-import.ts` genérico, `csv-import.ts` como wrapper, sin romper `/api/public/leads-import` ni el formulario del dashboard | lint, typecheck, build, prueba manual de compatibilidad CSV |
| 3 | `apify-client.ts`, `normalize.ts`, `ai-enrichment.ts`, `queries.ts` (con mocks funcionando sin claves reales) | typecheck, prueba manual con mock |
| 4 | Migración `LeadHunterExecution`, `run.ts`, `GET /api/cron/lead-hunter`, `POST /api/admin/lead-hunter/run`, lock de concurrencia | typecheck, migración aplicada en dev, prueba manual del endpoint |
| 5 | Panel `/lead-hunter` rediseñado, endpoints de historial/detalle/export, `notify.ts` (Resend) | typecheck, build, captura de pantalla |
| 6 | Suite `vitest` (12 casos pedidos), `docs/lead-hunter.md`, `.env.example` final, verificación completa (lint+typecheck+test+build), informe de entrega | todo verde, resumen final |

Continúo con la Fase 2.
