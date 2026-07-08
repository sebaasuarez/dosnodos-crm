import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  leadId: z.string(),
  title: z.string().min(1),
  scheduledAt: z.string(),
  durationMin: z.number().int().min(5).max(240).default(15),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const data = schema.parse(await request.json());
    const meeting = await db.meeting.create({
      data: {
        leadId: data.leadId,
        title: data.title,
        scheduledAt: new Date(data.scheduledAt),
        durationMin: data.durationMin,
        notes: data.notes,
      },
    });
    await db.lead.update({
      where: { id: data.leadId },
      data: { status: "REUNION_AGENDADA", nextStep: `Reunión: ${data.title}` },
    });
    await audit({
      action: "meeting.scheduled",
      actor: auth.user.email,
      userId: auth.user.id,
      entity: "meeting",
      entityId: meeting.id,
      detail: { leadId: data.leadId, scheduledAt: data.scheduledAt },
    });
    return NextResponse.json({ meeting }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
