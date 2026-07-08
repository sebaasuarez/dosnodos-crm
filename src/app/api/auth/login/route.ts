import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCredentials, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { handleApiError, jsonError } from "@/lib/api";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const { email, password } = schema.parse(await request.json());
    const user = await verifyCredentials(email, password);
    if (!user) {
      await audit({ action: "auth.login.failed", level: "warn", detail: { email } });
      return jsonError("Credenciales inválidas", 401);
    }
    await createSession(user);
    await audit({ action: "auth.login", actor: user.email, userId: user.id });
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
