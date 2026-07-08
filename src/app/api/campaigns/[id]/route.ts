import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().optional(),
  dailyLimit: z.number().int().min(1).max(200).optional(),
  hourlyLimit: z.number().int().min(1).max(50).optional(),
  templateId: z.string().nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const campaign = await db.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        recipients: { include: { lead: { select: { companyName: true, consentStatus: true } } }, take: 200 },
      },
    });
    if (!campaign) return jsonError("Campaña no encontrada", 404);
    return NextResponse.json({ campaign });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "MARKETING"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const data = patchSchema.parse(await request.json());
    const campaign = await db.campaign.update({ where: { id }, data });
    return NextResponse.json({ campaign });
  } catch (err) {
    return handleApiError(err);
  }
}
