import { NextResponse } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting, DEFAULT_SETTINGS } from "@/lib/settings";
import { requireApiSession, handleApiError } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ settings: await getAllSettings() });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.record(z.unknown());

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if (!auth.ok) return auth.response;
  try {
    const updates = patchSchema.parse(await request.json());
    const validKeys = Object.keys(DEFAULT_SETTINGS);
    const applied: string[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!validKeys.includes(key)) continue;
      await setSetting(key, value as never);
      applied.push(key);
    }
    await audit({
      action: "settings.updated",
      actor: auth.user.email,
      userId: auth.user.id,
      detail: { keys: applied },
    });
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    return handleApiError(err);
  }
}
