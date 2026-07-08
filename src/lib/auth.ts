import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { UserRole } from "@prisma/client";

const SESSION_COOKIE = "dn_session";
const SESSION_DURATION_H = 24 * 7;

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_H}h`)
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_H * 3600,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.sub as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

/** Roles con permiso de escritura sobre cada área del CRM. */
export const WRITE_ROLES: Record<string, UserRole[]> = {
  leads: ["ADMIN", "COMERCIAL"],
  campaigns: ["ADMIN", "MARKETING"],
  conversations: ["ADMIN", "COMERCIAL"],
  settings: ["ADMIN"],
  templates: ["ADMIN", "MARKETING"],
};

export function canWrite(role: UserRole, area: keyof typeof WRITE_ROLES) {
  return WRITE_ROLES[area]?.includes(role) ?? role === "ADMIN";
}

export async function verifyCredentials(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
