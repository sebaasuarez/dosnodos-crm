import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, handleApiError } from "@/lib/api";
import { runLeadHunter } from "@/lib/apify";

// El scraping real de Apify puede tardar más de los 10s por defecto de
// Vercel. 60s es el máximo permitido en el plan Hobby sin upgrade.
export const maxDuration = 60;

const schema = z.object({
  city: z.string().min(1),
  category: z.string().min(1),
  keywords: z.string().optional(),
  maxResults: z.number().int().min(1).max(100).default(20),
});

/** Ejecución manual del Lead Hunter desde el dashboard. */
export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL", "MARKETING"]);
  if (!auth.ok) return auth.response;
  try {
    const input = schema.parse(await request.json());
    const run = await runLeadHunter(input);
    return NextResponse.json({ run });
  } catch (err) {
    return handleApiError(err);
  }
}
