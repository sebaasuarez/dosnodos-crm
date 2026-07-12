import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Nunca se llama a la API real de OpenAI: se mockea el paquete `openai`
 * completo, incluso simulando `OPENAI_API_KEY` configurada, para probar el
 * camino de fallback cuando la llamada a IA falla (timeout, red, etc.).
 */
const parseMock = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { parse: parseMock } };
    },
  };
});

describe("enrichLeadWithAI — fallback ante fallo de IA", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key-simulada";
    parseMock.mockReset();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("devuelve null (nunca lanza) si la llamada a OpenAI falla", async () => {
    parseMock.mockRejectedValue(new Error("network timeout"));
    const { enrichLeadWithAI } = await import("@/lib/lead-hunter/ai-enrichment");

    const result = await enrichLeadWithAI({
      companyName: "Café de Prueba",
      category: "Cafés",
      hasWebsite: false,
      hasSocialMedia: true,
    });

    expect(result).toBeNull();
  });

  it("devuelve el resultado parseado cuando OpenAI responde bien", async () => {
    parseMock.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              opportunityReason: "Sin sitio web propio pese a buena reputación.",
              recommendedOffer: "Landing de presencia digital",
              outreachMessage: "Hola, vi tu negocio en Google Maps...",
              normalizedCategory: "Cafetería",
            },
          },
        },
      ],
    });
    const { enrichLeadWithAI } = await import("@/lib/lead-hunter/ai-enrichment");

    const result = await enrichLeadWithAI({
      companyName: "Café de Prueba",
      category: "Cafés",
      hasWebsite: false,
      hasSocialMedia: true,
    });

    expect(result).toEqual({
      opportunityReason: "Sin sitio web propio pese a buena reputación.",
      recommendedOffer: "Landing de presencia digital",
      outreachMessage: "Hola, vi tu negocio en Google Maps...",
      normalizedCategory: "Cafetería",
    });
  });

  it("sin OPENAI_API_KEY, devuelve null sin siquiera intentar llamar a OpenAI", async () => {
    delete process.env.OPENAI_API_KEY;
    const { enrichLeadWithAI } = await import("@/lib/lead-hunter/ai-enrichment");

    const result = await enrichLeadWithAI({
      companyName: "Café de Prueba",
      hasWebsite: false,
      hasSocialMedia: false,
    });

    expect(result).toBeNull();
    expect(parseMock).not.toHaveBeenCalled();
  });
});
