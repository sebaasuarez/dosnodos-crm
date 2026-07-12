import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { importLeadBatch, type NormalizedLeadInput } from "@/lib/lead-import";
import { importLeads } from "@/lib/csv-import";
import type { ParsedLeadRow } from "@/lib/csv-parse";

/**
 * Estos tests usan la BD Postgres real de desarrollo (no se mockea Prisma) —
 * lo que sí se mockea siempre es Apify/OpenAI (ver tests/setup.ts), que es
 * lo único externo. Todos los leads se marcan con TEST_CITY para poder
 * limpiarlos al final sin tocar datos reales de desarrollo.
 */
const TEST_CITY = "TestCiudadLeadHunter";

afterAll(async () => {
  await db.lead.deleteMany({ where: { city: TEST_CITY } });
});

function uniquePhone(prefix: string): string {
  return `+57${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 15);
}

describe("importLeadBatch — deduplicación dentro del mismo lote", () => {
  it("dos filas con el mismo teléfono en un lote solo crean un lead", async () => {
    const phone = uniquePhone("30");
    const leads: NormalizedLeadInput[] = [
      { companyName: "Negocio Duplicado A", city: TEST_CITY, phone },
      { companyName: "Negocio Duplicado B", city: TEST_CITY, phone },
    ];
    const summary = await importLeadBatch({ leads, source: "LEAD_HUNTER" });
    expect(summary.totalRows).toBe(2);
    expect(summary.created).toBe(1);
    expect(summary.duplicates).toBe(1);
  });
});

describe("importLeadBatch — deduplicación contra leads existentes en BD", () => {
  it("no recrea un lead que ya existe por teléfono", async () => {
    const phone = uniquePhone("31");
    const first = await importLeadBatch({
      leads: [{ companyName: "Negocio Existente", city: TEST_CITY, phone }],
      source: "LEAD_HUNTER",
    });
    expect(first.created).toBe(1);

    const second = await importLeadBatch({
      leads: [{ companyName: "Negocio Existente (otra corrida)", city: TEST_CITY, phone }],
      source: "LEAD_HUNTER",
    });
    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(1);

    const count = await db.lead.count({ where: { phone } });
    expect(count).toBe(1);
  });
});

describe("importLeadBatch — consentimiento", () => {
  it("todo lead creado entra siempre con SIN_CONSENTIMIENTO, sin importar la fuente", async () => {
    const phone = uniquePhone("32");
    const summary = await importLeadBatch({
      leads: [{ companyName: "Negocio Consentimiento", city: TEST_CITY, phone }],
      source: "LEAD_HUNTER",
    });
    expect(summary.created).toBe(1);

    const lead = await db.lead.findFirst({ where: { phone } });
    expect(lead?.consentStatus).toBe("SIN_CONSENTIMIENTO");
  });
});

describe("importLeadBatch — cálculo de métricas", () => {
  it("totalRows = created + duplicates cuando no hay duplicados", async () => {
    const leads: NormalizedLeadInput[] = [1, 2, 3].map((n) => ({
      companyName: `Negocio Métrica ${n}`,
      city: TEST_CITY,
      phone: uniquePhone(`33${n}`),
    }));
    const summary = await importLeadBatch({ leads, source: "LEAD_HUNTER" });
    expect(summary.totalRows).toBe(3);
    expect(summary.created + summary.duplicates).toBe(summary.totalRows);
    expect(summary.duplicates).toBe(0);
  });

  it("cuenta correctamente cuando la mitad del lote son duplicados de BD", async () => {
    const phoneA = uniquePhone("34");
    const phoneB = uniquePhone("35");
    await importLeadBatch({
      leads: [{ companyName: "Ya existe", city: TEST_CITY, phone: phoneA }],
      source: "LEAD_HUNTER",
    });

    const summary = await importLeadBatch({
      leads: [
        { companyName: "Ya existe otra vez", city: TEST_CITY, phone: phoneA },
        { companyName: "Nuevo de verdad", city: TEST_CITY, phone: phoneB },
      ],
      source: "LEAD_HUNTER",
    });
    expect(summary.totalRows).toBe(2);
    expect(summary.created).toBe(1);
    expect(summary.duplicates).toBe(1);
  });
});

describe("importLeadBatch — idempotencia", () => {
  it("correr el mismo lote dos veces no duplica leads en BD", async () => {
    const phone = uniquePhone("36");
    const leads: NormalizedLeadInput[] = [{ companyName: "Negocio Idempotente", city: TEST_CITY, phone }];

    const first = await importLeadBatch({ leads, source: "LEAD_HUNTER", batchLabel: "lead-hunter-test-idem" });
    const second = await importLeadBatch({ leads, source: "LEAD_HUNTER", batchLabel: "lead-hunter-test-idem" });

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(1);

    const count = await db.lead.count({ where: { phone } });
    expect(count).toBe(1);
  });
});

describe("importLeads (CSV) — compatibilidad hacia atrás tras el refactor a importLeadBatch", () => {
  it("una fila de CSV parseada sigue creando un lead con fuente CSV_IMPORT", async () => {
    const phone = uniquePhone("37");
    const row: ParsedLeadRow = {
      rowNumber: 1,
      companyName: "Negocio CSV",
      city: TEST_CITY,
      phone,
    };
    const summary = await importLeads([row]);
    expect(summary.created).toBe(1);

    const lead = await db.lead.findFirst({ where: { phone } });
    expect(lead?.source).toBe("CSV_IMPORT");
    expect(lead?.consentStatus).toBe("SIN_CONSENTIMIENTO");
  });
});
