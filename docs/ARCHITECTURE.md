# Arquitectura — Dos Nodos Growth CRM

Este documento cubre los entregables de diseño: arquitectura, flujos, modelo de datos,
pantallas, endpoints, plan por fases, riesgos, política anti-spam, medición diaria y
decisiones pendientes antes de producción.

---

## 1. Arquitectura propuesta

Monolito modular sobre **Next.js 15 + PostgreSQL**, desplegable en Vercel (o VPS con Docker).
Se eligió monolito por operabilidad: un solo despliegue, una sola base de datos, cero
infraestructura de colas para el volumen esperado (decenas de leads/día, no miles).

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js (App Router)                     │
│                                                                 │
│  ┌──────────────┐   ┌───────────────────────────────────────┐  │
│  │  Dashboard   │   │              API REST                 │  │
│  │  (React SSR) │   │  /api/leads /api/campaigns /api/...   │  │
│  └──────────────┘   └──────────────┬────────────────────────┘  │
│                                    │                            │
│  ┌─────────────────────────────────▼────────────────────────┐  │
│  │                  Capa de negocio (src/lib)               │  │
│  │                                                          │  │
│  │  compliance.ts ◄── GUARD ÚNICO: todo envío pasa por aquí │  │
│  │  scoring.ts        motor de scoring (pesos editables)    │  │
│  │  recommendation.ts recomendación de servicio             │  │
│  │  intents.ts        detección de intenciones (reglas)     │  │
│  │  ai.ts             asistente Claude + fallback de reglas │  │
│  │  conversation-engine.ts  pipeline de mensajes entrantes  │  │
│  │  campaign-engine.ts      audiencias y envíos controlados │  │
│  │  apify.ts          Lead Hunter (real o mock)             │  │
│  │  kapso.ts          cliente WhatsApp (real o simulado)    │  │
│  │  jobs.ts           5 jobs programados                    │  │
│  │  audit.ts          log de auditoría de TODO              │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │ Prisma                            │
└─────────────────────────────┼───────────────────────────────────┘
                              ▼
                        PostgreSQL

Integraciones externas:
  Kapso ──webhook──► /api/webhooks/kapso (firma verificada)
  Apify ◄──REST──── apify.ts (run-sync-get-dataset-items)
  Claude ◄──SDK──── ai.ts (respuestas + resúmenes)
  Landing ─POST───► /api/public/lead-capture (token + UTM + consentimiento)
  Cron ───GET/POST► /api/jobs/[job] (CRON_SECRET)
```

**Decisiones clave:**

- **Guard de cumplimiento centralizado** (`compliance.ts`): la regla anti-spam no vive
  en cada feature sino en un chokepoint. Es imposible enviar WhatsApp sin pasar por él.
- **Modo simulado en todas las integraciones**: sin API keys el sistema es 100% operable
  con datos mock — se prueba el flujo completo antes de contratar nada.
- **IA con respaldo determinista**: opt-out y escalamiento se deciden SIEMPRE por reglas,
  nunca por el LLM. La IA solo redacta respuestas dentro de los límites del sistema.
- **Jobs como endpoints HTTP** protegidos con secreto: compatibles con Vercel Cron,
  GitHub Actions, crontab o cron-job.org sin cambiar código.

## 2. Diagrama de flujo (texto)

### Flujo A — Prospección (fuente pública → nunca WhatsApp directo)

```
Apify Google Maps (diario o manual)
  → dedupe (maps URL / teléfono / nombre+ciudad)
  → lead NUEVO con consentStatus = SIN_CONSENTIMIENTO   ◄── WhatsApp BLOQUEADO
  → enriquecimiento: señales digitales + score 0-100 + servicio recomendado
  → CALIFICADO (score ≥ 31)
  → captación de opt-in por canales permitidos:
      email con enlace click-to-WhatsApp / landing / QR / anuncio
  → el prospecto ESCRIBE PRIMERO o marca casilla de consentimiento
  → consentStatus = OPT_IN (con evento trazable: canal, fuente, evidencia)
  → CONTACTO_PERMITIDO → entra al Flujo B
```

### Flujo B — Conversación WhatsApp (Kapso)

```
Mensaje entrante → webhook /api/webhooks/kapso (firma verificada)
  → buscar/crear lead por teléfono (si es nuevo: OPT_IN por iniciativa propia)
  → registrar mensaje + detectar intención (reglas)
  → ¿OPT_OUT? ("no", "stop", "no me escribas"...)
      → marcar OPT_OUT + evento con evidencia + confirmación + cerrar. FIN.
  → ¿pide humano / reclamo?
      → escalar: conversación PENDIENTE_HUMANO, IA off, tarea creada. FIN.
  → ¿intención caliente? (precio, llamada, web, automatizar...)
      → crear oportunidad + mover a INTERESADO + notificar
  → IA activa → generar respuesta (Claude o reglas)
      → GUARD: ¿opt-out? ¿ventana 24h? → enviar vía Kapso
  → score ≥ 80 + intención clara → escalar a humano
  → guardar resumen IA en el CRM
```

### Flujo C — Campañas

```
Crear campaña (tipo, canal, plantilla, límites, audiencia)
  → activar → preparar destinatarios:
      canal WhatsApp + lead sin OPT_IN → BLOQUEADO (visible, con razón)
      lead con OPT_IN → PENDIENTE
  → job horario procesa tandas:
      límite diario campaña ∧ límite horario ∧ GUARD global
      (horario 8-19 Bogotá, límite global, frecuencia por lead ≥24h)
  → envío → PRIMER_CONTACTO → respuesta entra por Flujo B
```

## 3. Modelo de datos

18 entidades (ver `prisma/schema.prisma`, fuente de verdad):

| Entidad | Rol |
|---|---|
| `users` | usuarios del CRM con rol |
| `leads` | núcleo: negocio + señales digitales + score + etapa + consentimiento + UTM |
| `lead_scores` | historial de scoring con desglose |
| `consent_events` | **trazabilidad legal**: cada opt-in/opt-out con canal, fuente y evidencia |
| `campaigns` / `campaign_recipients` | campañas con límites y estado por destinatario (incl. BLOQUEADO+razón) |
| `conversations` / `messages` | inbox WhatsApp; mensajes con intención detectada y estado (incl. BLOQUEADO) |
| `whatsapp_templates` | plantillas con estado de aprobación |
| `opportunities` | oportunidades con valor estimado y etapa |
| `tasks` / `notes` / `meetings` | actividad comercial |
| `apify_runs` | historial del Lead Hunter (resultados, nuevos, duplicados) |
| `automation_logs` | auditoría de todo el sistema |
| `settings` | configuración editable (límites, ciudades, pesos de scoring...) |
| `service_packages` | los 5 paquetes comerciales configurables |

Estados del lead (17): NUEVO → ENRIQUECIDO → CALIFICADO → PENDIENTE_CONSENTIMIENTO →
CONTACTO_PERMITIDO → PRIMER_CONTACTO → RESPONDIÓ → CONVERSACIÓN_ACTIVA → INTERESADO →
DIAGNÓSTICO_ENVIADO → REUNIÓN_AGENDADA → PROPUESTA_ENVIADA → NEGOCIACIÓN → GANADO |
PERDIDO | NO_CONTACTAR | OPT_OUT.

Consentimiento (4): SIN_CONSENTIMIENTO | PENDIENTE | OPT_IN | OPT_OUT.
**Un OPT_OUT nunca se revierte automáticamente** — requiere revisión humana.

## 4. Pantallas

| Ruta | Vista | Contenido |
|---|---|---|
| `/login` | Login | correo + contraseña |
| `/` | DashboardHome | métricas diarias, gráfica 14 días, embudo, leads calientes, tareas de hoy, alerta de bloqueos |
| `/leads` | LeadsTable | filtros (texto, etapa, consentimiento, ciudad, score), export CSV, paginación |
| `/leads/[id]` | LeadDetail | datos, score con desglose, recomendación, consentimiento + eventos, conversaciones, oportunidades, reuniones, tareas, notas |
| `/lead-hunter` | LeadHunter | búsqueda manual Apify + historial de runs |
| `/pipeline` | PipelineKanban | columnas por etapa, cambio de etapa por tarjeta |
| `/inbox` | WhatsAppInbox | lista + hilo, toggle IA/humano, resumen IA, envío manual, filtro "esperando humano" |
| `/campaigns` (+`/[id]`) | CampaignManager | crear/activar/pausar, contadores, destinatarios con razón de bloqueo |
| `/agenda` | Agenda | reuniones próximas y pasadas |
| `/compliance` | ComplianceCenter | opt-in/opt-out/sin consentimiento, límite usado, tasa de respuesta, plantillas, lista de no contactar, bloqueos recientes |
| `/reports` | Reports | semanal (ciudades, categorías, fuentes, servicios, pérdidas) + mensual (pipeline, conversiones) |
| `/logs` | Auditoría | filtros por nivel y acción |
| `/settings` | Settings | integraciones, parámetros operativos, paquetes, plantillas, usuarios |

## 5. Endpoints

```
POST  /api/auth/login | /api/auth/logout
GET   /api/dashboard/summary
GET   /api/leads                    (filtros: q, status, consent, city, scoreMin, page)
POST  /api/leads                    (creación manual)
GET   /api/leads/:id
PATCH /api/leads/:id                (etapa, datos, próximo paso, motivo de pérdida)
POST  /api/leads/:id/notes | /api/leads/:id/tasks | /api/leads/:id/score
GET   /api/campaigns                POST /api/campaigns
GET   /api/campaigns/:id            PATCH /api/campaigns/:id
POST  /api/campaigns/:id/start | /api/campaigns/:id/pause
GET   /api/conversations            GET /api/conversations/:id
PATCH /api/conversations/:id        (IA on/off, estado, asignación)
POST  /api/conversations/:id/messages   (envío humano — pasa por el guard)
POST  /api/webhooks/kapso           (público, firma verificada)
POST  /api/apify/run                GET /api/apify/runs
POST  /api/opt-in | /api/opt-out    (registro manual con evidencia)
POST  /api/public/lead-capture      (landing, token + UTM + consentimiento)
POST  /api/meetings
GET   /api/reports/daily | weekly | monthly | export (CSV)
GET   /api/settings                 PATCH /api/settings (solo ADMIN)
GET/POST /api/jobs/:job             (CRON_SECRET; 5 jobs)
```

## 6. Plan por fases

| Fase | Alcance | Estado |
|---|---|---|
| **1** | BD, dashboard, leads, Apify manual+mock, scoring, Kanban, configuración | ✅ Implementada |
| **2** | Webhook Kapso, inbox, motor de conversación, IA (Claude+reglas), opt-in/opt-out | ✅ Implementada |
| **3** | Campañas, plantillas, seguimiento automático, centro de cumplimiento | ✅ Implementada |
| **4** | Reportes semanales/mensuales, export CSV; Google Calendar (pendiente OAuth); email de captación (pendiente proveedor) | ◐ Parcial |
| **5** | Producción: claves reales, plantillas aprobadas por Meta, monitoreo, backups | Pendiente (guía en DEPLOYMENT.md) |

## 7. Riesgos

**Legales / cumplimiento**
- Contactar leads de fuentes públicas por WhatsApp sin opt-in viola políticas de
  WhatsApp Business y expone el número a bloqueo. *Mitigación: bloqueado por diseño en el guard.*
- Ley 1581/2012 (Colombia, habeas data): tratamiento de datos exige finalidad y
  autorización. *Mitigación: consent_events con evidencia, opt-out inmediato e irreversible
  sin revisión, endpoint de auditoría. Pendiente: política de privacidad publicada y
  proceso de supresión de datos a solicitud.*
- Plantillas de WhatsApp requieren aprobación de Meta vía Kapso antes de usarse fuera
  de la ventana de 24h.

**Técnicos**
- El formato exacto del webhook de Kapso puede diferir del asumido → el handler es
  tolerante, pero hay que validar con un webhook real antes de producción.
- Apify puede devolver resultados con estructura variable → parsing defensivo, errores
  auditados en `apify_runs.error`.
- Costo de LLM: cada mensaje entrante ≈ 1 llamada. *Mitigación: modelo configurable
  por variable de entorno; el motor de reglas funciona sin costo.*

**Comerciales**
- Tasa de respuesta baja daña la reputación del número → alerta en Cumplimiento cuando
  cae bajo 15%, límites conservadores por defecto (50/día global, 20/día por campaña).
- IA que "alucina" precios → prompt prohíbe precios cerrados y escala a humano;
  precios solo en `service_packages`.

## 8. Cómo se evita el spam (resumen ejecutivo)

1. **Consentimiento como estado de primera clase** con evidencia auditable.
2. **Guard único** (`checkCanSendWhatsApp`) para TODO envío: opt-out → bloqueado;
   sin opt-in y sin ventana de 24h → bloqueado; fuera de 8:00–19:00 Bogotá → bloqueado;
   límites diario/horario globales → bloqueado; mensaje proactivo < 24h desde el
   anterior → bloqueado.
3. Los bloqueos **no son silenciosos**: quedan como mensajes BLOQUEADO con razón,
   visibles en el inbox, la campaña, el centro de cumplimiento y la auditoría.
4. Palabras de baja ("no", "stop", "no me escribas", "cancelar"...) → opt-out
   automático + confirmación + cierre. La lista de no contactar es permanente.
5. Campañas de WhatsApp solo aceptan audiencia con OPT_IN; la captación de leads
   fríos usa canales permitidos (email/landing/QR/click-to-WhatsApp donde el
   prospecto inicia).

## 9. Medición del avance diario

- **Dashboard `/`**: leads hoy, calificados, score alto, opt-ins, mensajes/respuestas,
  conversaciones activas, esperando humano, reuniones, propuestas, ganadas, valor de
  pipeline, tasa de respuesta 7d, tareas de hoy y leads calientes.
- **Job `daily-report` (19:00)**: persiste el snapshot del día en auditoría.
- **Reportes**: semanal (mejores ciudades/categorías/fuentes/servicios, pérdidas y
  motivos) y mensual (pipeline, ganadas/perdidas, conversión lead→reunión→propuesta→venta).
- **Export CSV** para análisis externo.

## 10. Decisiones a confirmar antes de producción

1. **Número de WhatsApp**: ¿el actual de Dos Nodos o uno nuevo dedicado? (recomendado:
   dedicado, para proteger el personal).
2. **Plantillas**: aprobar en Meta (vía Kapso) las 6 plantillas del seed antes de
   activar campañas.
3. **Precios reales** de los 5 paquetes (el seed trae rangos de ejemplo).
4. **Modelo de IA y presupuesto**: `claude-opus-4-8` por defecto (máxima calidad);
   se puede bajar a un modelo más económico vía `ANTHROPIC_MODEL` si el volumen crece.
5. **Horario y límites**: valores por defecto conservadores (50/día global, 8:00–19:00);
   ajustar en Configuración según capacidad del equipo.
6. **Política de privacidad** publicada en dosnodos.com.co y enlazada en la landing
   (obligatoria para el formulario con consentimiento).
7. **Google Calendar y email de captación**: definir cuentas/proveedor (Resend,
   Brevo, etc.) para activar la Fase 4 completa.
8. **Hosting**: Vercel + Neon/Supabase Postgres (rápido) vs VPS propio (control).
