# Checklist de pruebas y criterios de aceptación

Estado verificado en desarrollo (Postgres real + modo simulado de integraciones).

> **Lead Hunter automático**: tiene su propia suite automatizada (`npm run
> test`, vitest) que mockea Apify/OpenAI y nunca los llama de verdad — ver
> `docs/lead-hunter.md`. La fila #4 de esta tabla describe el Lead Hunter
> legado de búsqueda manual puntual (`/api/apify/run`); la captura diaria
> automática ahora corre por `/api/cron/lead-hunter` (cron dedicado), no por
> `lead-discovery` dentro de `daily-all`.

## Verificado automáticamente en esta entrega

| # | Criterio | Estado | Cómo se probó |
|---|---|---|---|
| 1 | El dashboard carga correctamente | ✅ | Todas las vistas responden 200 con sesión |
| 2 | Se pueden ver leads diarios | ✅ | `/leads` con filtros + seed de 21 leads |
| 3 | Se puede ejecutar Apify manualmente | ✅ | POST `/api/apify/run` (mock) → 4 nuevos, dedupe activo |
| 4 | Se puede programar extracción diaria | ✅ | `vercel.json` + `/api/jobs/lead-discovery` con CRON_SECRET |
| 5 | Se eliminan duplicados | ✅ | run repetido → duplicates > 0 |
| 6 | Cada lead recibe score | ✅ | enriquecimiento automático con desglose visible |
| 7 | Cada lead recibe recomendación de servicio | ✅ | motor de reglas por categoría/señales |
| 8 | El CRM permite mover etapas | ✅ | Kanban y detalle con selector de etapa |
| 9 | El sistema registra consentimiento | ✅ | consent_events con canal/fuente/evidencia |
| 10 | El sistema bloquea mensajes sin opt-in | ✅ | campaña: 7 leads sin opt-in → BLOQUEADO con razón |
| 11 | Kapso recibe webhooks correctamente | ✅ | POST firmado → procesado; firma inválida → 401 |
| 12 | Los mensajes entrantes crean conversaciones | ✅ | webhook → lead + conversación + mensaje |
| 13 | La IA responde según reglas | ✅ | intenciones QUIERE_WEB/QUIERE_PRECIO → respuestas correctas |
| 14 | Se puede escalar a humano | ✅ | intención + toggle manual en inbox |
| 15 | Se pueden crear campañas | ✅ | formulario + API |
| 16 | Las campañas respetan límites | ✅ | envíos a las 23:05 Bogotá → BLOQUEADO "fuera de horario" |
| 17 | Se puede ver historial de conversaciones | ✅ | inbox con hilo completo e intenciones |
| 18 | Se pueden agendar reuniones | ✅ | formulario en detalle del lead → etapa REUNION_AGENDADA |
| 19 | Se generan reportes diarios | ✅ | job daily-report + `/reports` |
| 20 | El sistema muestra métricas de avance | ✅ | dashboard con 13 métricas + gráficas |
| 21 | Hay logs de errores | ✅ | `/logs` con niveles y auditoría completa |
| 22 | Hay roles y permisos | ✅ | 4 roles; settings solo ADMIN; API con verificación por rol |
| 23 | La configuración es editable | ✅ | `/settings` persiste en tabla settings |
| 24 | Está documentado el despliegue | ✅ | docs/DEPLOYMENT.md |
| 25 | Listo para pruebas con datos reales controlados | ✅ | modo simulado → solo faltan las API keys |

## Pruebas manuales antes de producción (con credenciales reales)

- [ ] Configurar KAPSO_API_KEY y verificar un mensaje real entrante/saliente.
- [ ] Validar el formato del payload del webhook de Kapso contra el handler
      (revisar `/logs` tras el primer mensaje real).
- [ ] Ejecutar Apify real con APIFY_TOKEN en 1 ciudad/categoría y validar el mapeo de campos.
- [ ] Probar la IA con ANTHROPIC_API_KEY: tono, brevedad, escalamiento.
- [ ] Enviar el formulario real de la landing con y sin casilla de consentimiento.
- [ ] Probar opt-out desde un teléfono real ("no me escribas") y verificar bloqueo posterior.
- [ ] Cambiar las contraseñas del seed.
- [ ] Aprobar las plantillas en Meta vía Kapso.

## Flujo de humo reproducible (sin credenciales)

```bash
npx prisma migrate dev && npm run db:seed && npm run dev

# Login: admin@dosnodos.com.co / dosnodos2026

# Webhook simulado (mensaje entrante):
curl -X POST http://localhost:3000/api/webhooks/kapso \
  -H "Content-Type: application/json" -H "x-webhook-secret: dev-webhook-secret" \
  -d '{"event":"message.received","data":{"message":{"from":"+573001234567","body":"Hola, quiero una página web"},"contact":{"name":"Prueba"}}}'

# Ver la conversación en /inbox, el lead en /leads, la respuesta automática de la IA.

# Opt-out:
curl -X POST http://localhost:3000/api/webhooks/kapso \
  -H "Content-Type: application/json" -H "x-webhook-secret: dev-webhook-secret" \
  -d '{"event":"message.received","data":{"message":{"from":"+573001234567","body":"no me escribas más"}}}'

# Verificar en /compliance que el lead quedó en la lista de no contactar.
```
