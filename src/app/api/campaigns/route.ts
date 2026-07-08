import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CampaignType, CampaignChannel } from "@prisma/client";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const campaigns = await db.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        template: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
    });
    return NextResponse.json({ campaigns });
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(CampaignType),
  channel: z.nativeEnum(CampaignChannel),
  dailyLimit: z.number().int().min(1).max(200).default(20),
  hourlyLimit: z.number().int().min(1).max(50).default(5),
  templateId: z.string().optional(),
  audienceFilter: z
    .object({
      cities: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      scoreMin: z.number().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "MARKETING"]);
  if (!auth.ok) return auth.response;
  try {
    const data = createSchema.parse(await request.json());
    const campaign = await db.campaign.create({
      data: {
        name: data.name,
        type: data.type,
        channel: data.channel,
        dailyLimit: data.dailyLimit,
        hourlyLimit: data.hourlyLimit,
        templateId: data.templateId || undefined,
        audienceFilter: data.audienceFilter,
        status: "BORRADOR",
      },
    });
    await audit({
      action: "campaign.created",
      actor: auth.user.email,
      userId: auth.user.id,
      entity: "campaign",
      entityId: campaign.id,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
