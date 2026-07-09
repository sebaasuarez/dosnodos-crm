# Importación masiva de leads por CSV

Dos formas de subir leads en lote al CRM:

1. **Dashboard** (`/leads` → botón "Subir CSV de leads"): arrastras/seleccionas el
   archivo, ves una vista previa, confirmas. Requiere sesión (rol ADMIN, COMERCIAL
   o MARKETING).
2. **API pública** (`POST /api/public/leads-import`): para automatizaciones externas
   (ej. un flujo de ChatGPT/Zapier/Make que investiga y genera el CSV). No requiere
   login — se protege con un token estático.

> **Cumplimiento:** todos los leads importados por CSV entran **sin consentimiento
> de WhatsApp** (`consentStatus = SIN_CONSENTIMIENTO`), igual que los del Lead
> Hunter. El sistema bloqueará cualquier envío de WhatsApp hasta que exista opt-in
> trazable por un canal permitido (el lead escribe primero, formulario con
> casilla marcada, QR, etc.). El CSV no puede saltarse esta regla.

## Formato del CSV

Encabezados exactos (minúsculas o mayúsculas, no importa), separados por coma,
codificación UTF-8. Solo **`nombre_negocio`** es obligatorio, y se exige al menos
uno de **`telefono`** o **`email`** (un lead sin forma de contactarlo no sirve).

| Columna | Obligatoria | Descripción |
|---|---|---|
| `nombre_negocio` | ✅ | Nombre del negocio/empresa |
| `nombre_contacto` | | Nombre de la persona de contacto |
| `telefono` | ⚠️ una de las dos | Formato internacional recomendado: `+573001234567` |
| `email` | ⚠️ una de las dos | |
| `sitio_web` | | URL completa |
| `ciudad` | | |
| `pais` | | Por defecto "Colombia" si se omite |
| `categoria` | | Ej: "Restaurantes", "Barberías" (afecta el scoring y la recomendación) |
| `direccion` | | |
| `rating` | | Número 0-5 (ej. de Google Maps si lo tienes) |
| `resenas` | | Número entero de reseñas |
| `instagram` | | URL o handle |
| `facebook` | | URL o handle |
| `google_maps_url` | | URL de la ficha, si existe |
| `notas` | | Se guarda como nota interna del lead (ej. resumen de tu investigación con IA) |
| `fuente_detalle` | | Texto libre para identificar el lote, ej. `lote-2026-07-09` |

Descarga la plantilla exacta desde el dashboard (`/leads` → "Descargar plantilla")
o vía `GET /api/leads/import/template` (requiere sesión).

### Ejemplo de fila

```csv
nombre_negocio,nombre_contacto,telefono,email,sitio_web,ciudad,pais,categoria,direccion,rating,resenas,instagram,facebook,google_maps_url,notas,fuente_detalle
Panadería La Espiga,Rosa Muñoz,+573001112233,rosa@laespiga.co,,Medellín,Colombia,Emprendimientos locales,Cra 45 #10-20,4.5,32,https://instagram.com/laespiga,,,"Investigado por automatización GPT, buen potencial",lote-2026-07-09
```

## Qué hace el sistema al importar

Por cada fila válida y no duplicada:

1. **Deduplica** contra la base existente por teléfono, email o negocio+ciudad
   (y contra otras filas del mismo archivo).
2. **Calcula el score** (0-100) con las mismas reglas y pesos configurables que
   usa el Lead Hunter.
3. **Genera la recomendación de servicio** según categoría y señales digitales.
4. **Guarda las notas** (columna `notas`) como nota interna del lead, si viene.
5. Marca la fuente como `CSV_IMPORT` y guarda `fuente_detalle` para trazabilidad.

El resumen de la importación devuelve: filas totales, creados, duplicados omitidos
y errores por fila (con el motivo).

## Uso desde una automatización externa (API)

```bash
curl -X POST https://<tu-dominio>/api/public/leads-import \
  -H "x-import-token: $CSV_IMPORT_TOKEN" \
  -H "Content-Type: text/csv" \
  --data-binary @leads.csv
```

O como JSON:

```bash
curl -X POST https://<tu-dominio>/api/public/leads-import \
  -H "x-import-token: $CSV_IMPORT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"csv": "nombre_negocio,telefono\nMi Negocio,+573001234567\n", "batchLabel": "lote-chatgpt-01"}'
```

Respuesta (`201`):

```json
{
  "totalRows": 12,
  "created": 10,
  "duplicates": 2,
  "invalid": 0,
  "errors": []
}
```

`CSV_IMPORT_TOKEN` es una variable de entorno independiente de `LANDING_FORM_TOKEN`
— rótala sin afectar el formulario de la landing si se filtra.
