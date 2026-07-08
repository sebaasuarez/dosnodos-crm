import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";
import { processOptIn } from "@/lib/compliance";

const schema = z.object({
  leadId: z.string(),
  channel: z.string().default("manual"),
  source: z.string().min(3, "Describe de dónde salió el consentimiento"),
  evidence: z.string().optional(),
});

/** Registro manual de opt-in (requiere fuente y evidencia trazable). */
export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const data = schema.parse(await request.json());
    const result = await processOptIn(data.leadId, data.channel, data.source, data.evidence);
    if (!result.ok) return jsonError(result.reason, 409);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
