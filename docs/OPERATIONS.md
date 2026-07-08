# Guía de uso diario — Dos Nodos Growth CRM

Rutina recomendada para operar el sistema en ~30 minutos al día.

## Mañana (10 min)

1. **Abrir el Resumen (`/`)**
   - Revisa "Esperando humano": si hay conversaciones escaladas, atiéndelas primero.
   - Revisa "Oportunidades calientes": leads con score 61+ ordenados por potencial.
   - Revisa "Tareas para hoy".

2. **Revisar el Lead Hunter (`/lead-hunter`)**
   - El job nocturno ya capturó leads nuevos. Verifica el run: nuevos vs duplicados.
   - Si quieres más volumen en una ciudad/categoría específica, lanza una búsqueda manual.

3. **Revisar el inbox (`/inbox`)**
   - Filtro "Esperando humano" → responde tú. Al responder, la conversación queda a tu cargo.
   - El botón "IA activa / Control humano" te deja tomar o devolver el control por conversación.

## Mediodía (10 min)

4. **Trabajar el pipeline (`/pipeline`)**
   - Mueve leads de etapa según lo que pasó (llamadas hechas, propuestas enviadas).
   - Al marcar PERDIDO el sistema pide el motivo (alimenta el reporte semanal).

5. **Prospección permitida (`/leads?consent=SIN_CONSENTIMIENTO&scoreMin=61`)**
   - Estos leads NO pueden recibir WhatsApp todavía. Para contactarlos:
     - Envíales email con enlace click-to-WhatsApp (wa.me/TU_NUMERO), o
     - Espera a que lleguen por la landing/QR/anuncio.
   - Cuando un lead te escriba o dé consentimiento, registra el opt-in desde su detalle
     (botón "Registrar opt-in" — siempre con la fuente real, queda auditado).

## Tarde (10 min)

6. **Campañas (`/campaigns`)**
   - Revisa contadores: enviados / respondieron / bloqueados.
   - Los bloqueados muestran la razón exacta (sin opt-in, fuera de horario, límite).
   - Pausa cualquier campaña con tasa de respuesta pobre.

7. **Agenda (`/agenda`)**: confirma las reuniones de mañana.

8. **Cumplimiento (`/compliance`)** (2 min)
   - Límite diario usado: si llega al 90% aparece en rojo.
   - Tasa de respuesta 7d: si baja de 15% con volumen, frena campañas y revisa el mensaje.
   - Opt-outs nuevos: son permanentes, no intentes revertirlos.

## Acciones frecuentes

| Quiero… | Dónde |
|---|---|
| Agendar una llamada con un lead | Detalle del lead → sección Reuniones |
| Crear una nota o tarea | Detalle del lead |
| Recalcular el score tras editar datos | Detalle del lead → "Recalcular score" |
| Responder yo en vez de la IA | Inbox → botón "IA activa" → pasa a "Control humano" |
| Exportar todos los leads | `/leads` → "Exportar CSV" |
| Cambiar límites de envío u horarios | `/settings` (solo ADMIN) |
| Ver por qué no salió un mensaje | `/compliance` → "Mensajes bloqueados" o `/logs` |

## Semáforo del score

| Rango | Significado | Acción |
|---|---|---|
| 81–100 | Oportunidad alta | prioridad máxima, contactar hoy (por canal permitido) |
| 61–80 | Oportunidad buena | contactar esta semana |
| 31–60 | Prioridad media | nutrir con contenido/campañas de captación |
| 0–30 | Baja prioridad | dejar en base, revisar en reactivación |

## Reglas de oro

1. **Nunca** contactes por WhatsApp a un lead "Sin consentimiento" — el sistema lo
   bloqueará de todas formas, pero el canal correcto es email/landing/QR.
2. **Nunca** intentes revertir un opt-out. Si el cliente vuelve a escribir por su
   cuenta, el sistema lo detectará y pedirá revisión manual.
3. Registra siempre la **fuente real** al hacer opt-in manual: es la evidencia legal.
4. Si un lead se molesta, marca opt-out tú mismo desde su detalle.
5. Mantén los límites conservadores hasta que el número tenga historial sano.
