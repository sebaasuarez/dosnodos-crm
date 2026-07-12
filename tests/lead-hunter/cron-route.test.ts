import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/cron/lead-hunter/route";

describe("GET /api/cron/lead-hunter — autenticación", () => {
  it("responde 401 sin header de autorización", async () => {
    const res = await GET(new Request("http://localhost/api/cron/lead-hunter"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("responde 401 con un secreto incorrecto", async () => {
    const res = await GET(
      new Request("http://localhost/api/cron/lead-hunter", {
        headers: { Authorization: "Bearer secreto-equivocado" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
