/**
 * Parser de CSV puro, sin dependencias de servidor (Prisma, etc.) — seguro
 * de importar tanto en server components/routes como en client components
 * (usado por la vista previa del formulario de importación).
 */

export const CSV_COLUMNS = [
  "nombre_negocio",
  "nombre_contacto",
  "telefono",
  "email",
  "sitio_web",
  "ciudad",
  "pais",
  "categoria",
  "direccion",
  "rating",
  "resenas",
  "instagram",
  "facebook",
  "google_maps_url",
  "notas",
  "fuente_detalle",
] as const;

export const CSV_TEMPLATE = `nombre_negocio,nombre_contacto,telefono,email,sitio_web,ciudad,pais,categoria,direccion,rating,resenas,instagram,facebook,google_maps_url,notas,fuente_detalle
Panadería La Espiga,Rosa Muñoz,+573001112233,rosa@laespiga.co,,Medellín,Colombia,Emprendimientos locales,Cra 45 #10-20,4.5,32,https://instagram.com/laespiga,,,"Investigado por automatización GPT, buen potencial",lote-2026-07-09
`;

export type ParsedLeadRow = {
  rowNumber: number; // 1-indexed, sin contar encabezado
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  website?: string;
  city?: string;
  country?: string;
  category?: string;
  address?: string;
  rating?: number;
  reviewsCount?: number;
  instagram?: string;
  facebook?: string;
  googleMapsUrl?: string;
  notes?: string;
  sourceDetail?: string;
};

export type RowError = { rowNumber: number; reason: string };

/** Parser CSV RFC4180 mínimo: comillas, comas y saltos de línea dentro de campos citados. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const clean = text.replace(/^﻿/, ""); // BOM

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function parseLeadsCsv(text: string): { rows: ParsedLeadRow[]; errors: RowError[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: [{ rowNumber: 0, reason: "Archivo vacío" }] };

  const headers = table[0].map((h) => h.trim().toLowerCase());
  const idx = (col: string) => headers.indexOf(col);
  const nameIdx = idx("nombre_negocio");
  if (nameIdx === -1) {
    return {
      rows: [],
      errors: [{ rowNumber: 0, reason: "Falta la columna obligatoria 'nombre_negocio' en el encabezado" }],
    };
  }

  const rows: ParsedLeadRow[] = [];
  const errors: RowError[] = [];

  for (let r = 1; r < table.length; r++) {
    const cols = table[r];
    const get = (col: string): string | undefined => {
      const i = idx(col);
      return i >= 0 ? cols[i]?.trim() || undefined : undefined;
    };
    const rowNumber = r; // 1-indexed relativo a los datos (sin encabezado)
    const companyName = get("nombre_negocio");
    const phone = get("telefono");
    const email = get("email");

    if (!companyName) {
      errors.push({ rowNumber, reason: "Falta 'nombre_negocio'" });
      continue;
    }
    if (!phone && !email) {
      errors.push({ rowNumber, reason: "Debe tener al menos 'telefono' o 'email'" });
      continue;
    }

    rows.push({
      rowNumber,
      companyName,
      contactName: get("nombre_contacto"),
      phone,
      email,
      website: get("sitio_web"),
      city: get("ciudad"),
      country: get("pais") || "Colombia",
      category: get("categoria"),
      address: get("direccion"),
      rating: toNumber(get("rating")),
      reviewsCount: toNumber(get("resenas")) ? Math.round(toNumber(get("resenas"))!) : undefined,
      instagram: get("instagram"),
      facebook: get("facebook"),
      googleMapsUrl: get("google_maps_url"),
      notes: get("notas"),
      sourceDetail: get("fuente_detalle"),
    });
  }

  return { rows, errors };
}
