import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "MARKETING"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const campaign = await db.campaign.update({ where: { id }, data: { status: "PAUSADA" } });
    await audit({
      action: "campaign.paused",
      actor: auth.user.email,
      userId: auth.user.id,
      entity: "campaign",
      entityId: id,
    });
    return NextResponse.json({ campaign });
  } catch (err) {
    return handleApiError(err);
  }
}
