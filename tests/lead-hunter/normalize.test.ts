import { describe, it, expect } from "vitest";
import { normalizePhone, normalizeEmail, normalizeUrl, hasUsableContact } from "@/lib/lead-hunter/normalize";

describe("normalizePhone", () => {
  it("normaliza un número colombiano con espacios y prefijo +57 a E.164", () => {
    expect(normalizePhone("+57 300 8985047", "Colombia")).toBe("+573008985047");
  });

  it("normaliza un número local sin prefijo usando el país por defecto", () => {
    expect(normalizePhone("3008985047", "Colombia")).toBe("+573008985047");
  });

  it("devuelve undefined para un valor no interpretable como teléfono", () => {
    expect(normalizePhone("abc", "Colombia")).toBeUndefined();
  });

  it("devuelve undefined si no se pasa ningún valor", () => {
    expect(normalizePhone(undefined, "Colombia")).toBeUndefined();
  });
});

describe("normalizeEmail / validación de contacto", () => {
  it("acepta un email con forma válida y lo pasa a minúsculas", () => {
    expect(normalizeEmail("Contacto@Negocio.CO")).toBe("contacto@negocio.co");
  });

  it("rechaza un email sin arroba o sin dominio", () => {
    expect(normalizeEmail("no-es-email")).toBeUndefined();
    expect(normalizeEmail("falta@dominio")).toBeUndefined();
  });

  it("hasUsableContact exige teléfono O email, ninguno de los dos no basta", () => {
    expect(hasUsableContact({ phone: "+573008985047", email: undefined })).toBe(true);
    expect(hasUsableContact({ phone: undefined, email: "a@b.com" })).toBe(true);
    expect(hasUsableContact({ phone: undefined, email: undefined })).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("agrega esquema https si falta", () => {
    expect(normalizeUrl("linktr.ee/x")).toBe("https://linktr.ee/x");
  });

  it("rechaza esquemas peligrosos como javascript:", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeUndefined();
  });
});
