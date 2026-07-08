# Guía de despliegue

## Opción A — Vercel + Postgres gestionado (recomendada)

1. **Base de datos**: crea un Postgres en [Neon](https://neon.tech) o
   [Supabase](https://supabase.com) y copia la cadena de conexión.

2. **Proyecto en Vercel**: importa el repo. El build ya ejecuta `prisma generate`.

3. **Variables de entorno** (Vercel → Settings → Environment Variables):

   ```
   DATABASE_URL              postgresql://... (con ?sslmode=require)
   APP_URL                   https://crm.dosnodos.com.co
   LANDING_URL               https://ventas.dosnodos.com.co
   DOS_NODOS_MAIN_URL        https://dosnodos.com.co
   JWT_SECRET                (openssl rand -hex 32)
   CRON_SECRET               (openssl rand -hex 32)
   LANDING_FORM_TOKEN        (openssl rand -hex 32)
   KAPSO_API_KEY             (desde app.kapso.ai)
   KAPSO_PHONE_NUMBER_ID     (desde Kapso)
   KAPSO_WEBHOOK_SECRET      (defínelo tú y configúralo igual en Kapso)
   APIFY_TOKEN               (console.apify.com → Integrations)
   APIFY_GOOGLE_MAPS_ACTOR_ID compass~crawler-google-places
   ANTHROPIC_API_KEY         (console.anthropic.com)
   ANTHROPIC_MODEL           claude-opus-4-8
   ```

4. **Migraciones**: en el primer deploy ejecuta desde tu máquina:

   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   DATABASE_URL="postgresql://..." npm run db:seed
   ```

   > El seed crea los usuarios con contraseña `dosnodos2026` — **cámbialas de inmediato**
   > (por ahora: actualizando `passwordHash` con un hash bcrypt nuevo).

5. **Crons**: `vercel.json` ya define los 5 jobs. Vercel los invoca con
   `Authorization: Bearer $CRON_SECRET` automáticamente al tener la variable definida.

   | Job | Horario (UTC) | Función |
   |---|---|---|
   | lead-discovery | 07:00 (02:00 Bogotá) | Apify diario |
   | lead-enrichment | 07:30 | score + recomendación de pendientes |
   | campaign-preparation | cada hora 9-18 L-S | audiencias + envíos de campañas |
   | follow-up | 08:00 L-S | tareas de seguimiento, alertas |
   | daily-report | 19:00 | snapshot diario |

   > Nota: los horarios de `vercel.json` están en UTC. Bogotá es UTC-5 — ajusta si
   > quieres que los envíos de campaña coincidan con horario comercial local (el guard
   > bloquea fuera de 8:00–19:00 Bogotá de todas formas).

6. **Webhook de Kapso**: en Kapso configura la URL
   `https://<tu-dominio>/api/webhooks/kapso` y el header/secreto igual a
   `KAPSO_WEBHOOK_SECRET`. Verifica con un mensaje real que el payload coincida con lo
   esperado por `src/app/api/webhooks/kapso/route.ts` (el handler es tolerante, pero
   valida el primer mensaje mirando `/logs`).

7. **Landing**: en el formulario de ventas.dosnodos.com.co haz POST a
   `https://<tu-dominio>/api/public/lead-capture` con header `x-form-token` y body:

   ```json
   {
     "name": "...", "businessName": "...", "phone": "+57...", "email": "...",
     "message": "...", "whatsappConsent": true,
     "utmSource": "...", "utmMedium": "...", "utmCampaign": "...",
     "sourceUrl": "https://ventas.dosnodos.com.co/..."
   }
   ```

   La casilla de consentimiento debe existir en el formulario y enlazarse a la
   política de privacidad; solo con `whatsappConsent: true` el lead entra con opt-in.

## Opción B — VPS con Docker

```bash
# Postgres
docker run -d --name dn-postgres -e POSTGRES_USER=dosnodos \
  -e POSTGRES_PASSWORD=<segura> -e POSTGRES_DB=dosnodos_crm \
  -v dn_pgdata:/var/lib/postgresql/data -p 5432:5432 postgres:16

# App (el build genera salida standalone)
npm ci && npm run build
node .next/standalone/server.js   # detrás de nginx/caddy con TLS

# Crons (crontab)
0 7 * * *   curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://crm.../api/jobs/lead-discovery
30 7 * * *  curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://crm.../api/jobs/lead-enrichment
0 9-18 * * 1-6 curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://crm.../api/jobs/campaign-preparation
0 8 * * 1-6 curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://crm.../api/jobs/follow-up
0 19 * * *  curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://crm.../api/jobs/daily-report
```

## Recomendaciones de producción

- **Backups**: activa backups automáticos del Postgres (Neon/Supabase los incluyen).
- **Monitoreo**: revisa `/logs?level=error` a diario; integra alertas (Sentry o similar)
  como mejora.
- **Secretos**: nunca en el repo; rota `JWT_SECRET`/`CRON_SECRET` si hay sospecha de fuga.
- **Reputación WhatsApp**: empieza con límites bajos (20-30/día), sube gradualmente
  mientras la tasa de respuesta se mantenga sana (>20%).
- **Datos personales**: define el proceso de supresión a solicitud (borrar lead +
  mensajes o anonimizar) según Ley 1581/2012.
- **Pruebas con datos reales controlados**: antes de activar campañas, prueba el flujo
  completo con teléfonos del equipo.
