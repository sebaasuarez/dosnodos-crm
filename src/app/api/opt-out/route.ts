import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, handleApiError } from "@/lib/api";
import { processOptOut } from "@/lib/compliance";

const schema = z.object({
  leadId: z.string(),
  channel: z.string().default("manual"),
  evidence: z.string().default("Registrado manualmente desde el CRM"),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const data = schema.parse(await request.json());
    await processOptOut(data.leadId, data.channel, data.evidence);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
