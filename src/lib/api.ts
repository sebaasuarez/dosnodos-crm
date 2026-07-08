import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth";
import type { UserRole } from "@prisma/client";
import { ZodError } from "zod";

/** Helpers comunes para route handlers. */

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireApiSession(roles?: UserRole[]): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: NextResponse }
> {
  const user = await getSession();
  if (!user) return { ok: false, response: jsonError("No autenticado", 401) };
  if (roles && !roles.includes(user.role)) {
    return { ok: false, response: jsonError("Sin permisos para esta acción", 403) };
  }
  return { ok: true, user };
}

export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const header =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || header !== secret) {
    return jsonError("Cron secret inválido", 401);
  }
  return null;
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return jsonError(
      `Datos inválidos: ${err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
      422,
    );
  }
  console.error("[api]", err);
  return jsonError("Error interno", 500);
}
