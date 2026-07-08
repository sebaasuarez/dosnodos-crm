import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        lead: true,
        messages: { orderBy: { createdAt: "asc" } },
        assignedTo: { select: { name: true } },
      },
    });
    if (!conversation) return jsonError("Conversación no encontrada", 404);
    return NextResponse.json({ conversation });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  aiEnabled: z.boolean().optional(),
  status: z.enum(["ABIERTA", "PENDIENTE_HUMANO", "CERRADA"]).optional(),
  assignedToId: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const data = patchSchema.parse(await request.json());
    const conversation = await db.conversation.update({ where: { id }, data });
    return NextResponse.json({ conversation });
  } catch (err) {
    return handleApiError(err);
  }
}
