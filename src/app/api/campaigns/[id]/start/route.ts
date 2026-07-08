import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";
import { prepareCampaignRecipients } from "@/lib/campaign-engine";
import { audit } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "MARKETING"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) return jsonError("Campaña no encontrada", 404);
    const updated = await db.campaign.update({
      where: { id },
      data: { status: "ACTIVA", startDate: campaign.startDate ?? new Date() },
    });
    const prepared = await prepareCampaignRecipients(updated);
    await audit({
      action: "campaign.started",
      actor: auth.user.email,
      userId: auth.user.id,
      entity: "campaign",
      entityId: id,
      detail: prepared,
    });
    return NextResponse.json({ campaign: updated, prepared });
  } catch (err) {
    return handleApiError(err);
  }
}
