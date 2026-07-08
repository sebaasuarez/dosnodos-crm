import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";
import { sendReply } from "@/lib/conversation-engine";

const schema = z.object({ content: z.string().min(1) });

/** Envío manual de mensaje por un agente humano (pasa por el guard). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const { content } = schema.parse(await request.json());
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: { lead: true },
    });
    if (!conversation) return jsonError("Conversación no encontrada", 404);

    const result = await sendReply(conversation.lead, conversation, content, {
      sentByAi: false,
      isProactive: false,
    });
    if (!result.sent) {
      return jsonError(`Mensaje bloqueado: ${result.reason}`, 409);
    }
    // Al responder un humano, la conversación queda atendida
    await db.conversation.update({
      where: { id },
      data: { status: "ABIERTA", assignedToId: auth.user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
