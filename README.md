# Dos Nodos Growth CRM + WhatsApp Sales Automation

Plataforma de automatización comercial para **Dos Nodos** ([dosnodos.com.co](https://dosnodos.com.co)):
captura diaria de prospectos, CRM con pipeline completo, conversaciones de WhatsApp
asistidas por IA (vía Kapso), campañas con control de consentimiento y dashboard ejecutivo.

> **Principio central: cero spam.** Ningún mensaje de WhatsApp sale sin opt-in trazable
> o sin que el prospecto haya escrito primero. El guard de cumplimiento
> (`src/lib/compliance.ts`) es un punto único por el que pasa TODO envío.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend + Backend | Next.js 15 (App Router) + TypeScript |
| Base de datos | PostgreSQL + Prisma |
| WhatsApp | Kapso (con modo simulado sin credenciales) |
| Lead scraping | Apify Google Maps Scraper (con modo mock sin token) |
| IA comercial | Claude (Anthropic) — `claude-opus-4-8`, con motor de reglas como respaldo |
| Estilos | Tailwind CSS |
| Auth | JWT en cookie httpOnly + roles (ADMIN, COMERCIAL, MARKETING, LECTURA) |

## Inicio rápido

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env       # edita DATABASE_URL y secretos

# 3. Base de datos
npx prisma migrate dev     # crea el esquema
npm run db:seed            # usuarios, paquetes, plantillas y datos mock

# 4. Desarrollo
npm run dev                # http://localhost:3000
```

**Usuarios del seed** (contraseña: `dosnodos2026`):

| Correo | Rol |
|---|---|
| admin@dosnodos.com.co | ADMIN |
| comercial@dosnodos.com.co | COMERCIAL |
| marketing@dosnodos.com.co | MARKETING |
| lectura@dosnodos.com.co | LECTURA |

Sin `APIFY_TOKEN`, `KAPSO_API_KEY` ni `ANTHROPIC_API_KEY` el sistema corre en **modo
simulado**: el Lead Hunter genera negocios de prueba, los envíos de WhatsApp se registran
sin salir y la IA responde con el motor de reglas. Todo el flujo es probable end-to-end.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura, flujos, modelo de datos, endpoints, plan por fases, riesgos y decisiones pendientes |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Guía de despliegue (Vercel + Postgres gestionado o VPS), crons y variables |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Guía de uso diario para el equipo de Dos Nodos |
| [docs/TESTING.md](docs/TESTING.md) | Checklist de pruebas y criterios de aceptación |

## Scripts

```bash
npm run dev              # servidor de desarrollo
npm run build            # build de producción (incluye prisma generate)
npm run start            # servidor de producción
npm run typecheck        # verificación de tipos
npm run prisma:migrate   # migraciones en desarrollo
npm run prisma:deploy    # migraciones en producción
npm run db:seed          # datos iniciales + mock
npm run job -- <nombre>  # ejecutar un job: lead-discovery | lead-enrichment |
                         # campaign-preparation | follow-up | daily-report
```

## Estructura

```
prisma/            esquema y seed
src/lib/           lógica de negocio (scoring, cumplimiento, IA, Kapso, Apify, jobs)
src/app/api/       API REST
src/app/(dashboard)/  vistas del CRM
src/components/    componentes de UI
scripts/           runner de jobs por CLI
docs/              documentación
```
