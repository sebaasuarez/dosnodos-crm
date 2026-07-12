import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Protege el dashboard y la API.
 * Rutas públicas: login, webhook de Kapso, jobs (validan CRON_SECRET),
 * captura de leads de la landing (valida LANDING_FORM_TOKEN).
 */

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/webhooks/kapso",
  "/api/public/lead-capture",
  "/api/public/leads-import",
];

const PUBLIC_PREFIXES = ["/api/jobs/", "/api/cron/", "/_next/", "/favicon"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("dn_session")?.value;
  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret"));
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
