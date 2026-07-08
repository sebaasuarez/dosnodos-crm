import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { LeadStatus } from "@prisma/client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
        tasks: { orderBy: { dueDate: "asc" } },
        opportunities: true,
        meetings: { orderBy: { scheduledAt: "desc" } },
        consentEvents: { orderBy: { createdAt: "desc" } },
        conversations: { orderBy: { createdAt: "desc" } },
        campaignRecipients: { include: { campaign: { select: { name: true } } } },
      },
    });
    if (!lead) return jsonError("Lead no encontrado", 404);
    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().nullable().optional(),
  nextStep: z.string().nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  lostReason: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const data = patchSchema.parse(await request.json());
    const previous = await db.lead.findUnique({ where: { id } });
    if (!previous) return jsonError("Lead no encontrado", 404);

    const lead = await db.lead.update({
      where: { id },
      data: {
        ...data,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : data.nextFollowUpAt === null ? null : undefined,
      },
    });
    if (data.status && data.status !== previous.status) {
      await audit({
        action: "lead.stage_changed",
        actor: auth.user.email,
        userId: auth.user.id,
        entity: "lead",
        entityId: id,
        detail: { from: previous.status, to: data.status },
      });
    }
    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}
