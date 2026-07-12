import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSession: vi.fn(),
  };
});

describe("POST /api/admin/lead-hunter/run — control de acceso", () => {
  it("responde 401 sin sesión", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/lead-hunter/run/route");

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("responde 403 con una sesión que no es ADMIN", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue({
      id: "user_1",
      name: "Comercial",
      email: "comercial@dosnodos.com.co",
      role: "COMERCIAL",
    });
    const { POST } = await import("@/app/api/admin/lead-hunter/run/route");

    const res = await POST();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/permisos/i);
  });
});
