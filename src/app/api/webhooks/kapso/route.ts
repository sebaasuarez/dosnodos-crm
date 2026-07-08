import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyKapsoWebhook } from "@/lib/kapso";
import { processInboundMessage } from "@/lib/conversation-engine";
import { jsonError } from "@/lib/api";

/**
 * Webhook de Kapso. Recibe:
 *  - Mensajes entrantes de WhatsApp → pipeline de conversación.
 *  - Actualizaciones de estado (entregado/leído/fallido) → actualiza mensajes.
 *
 * El formato exacto del payload depende de la configuración en Kapso;
 * este handler acepta la estructura estándar de eventos y es tolerante
 * a campos adicionales.
 */

const inboundSchema = z.object({
  event: z.string().optional(),
  type: z.string().optional(),
  data: z
    .object({
      conversation_id: z.string().optional(),
      message: z
        .object({
          id: z.string().optional(),
          from: z.string().optional(),
          body: z.string().optional(),
          text: z.string().optional(),
        })
        .optional(),
      contact: z.object({ name: z.string().optional(), phone: z.string().optional() }).optional(),
      status: z.string().optional(),
      message_id: z.string().optional(),
    })
    .optional(),
  // formato plano alternativo
  from: z.string().optional(),
  body: z.string().optional(),
  message_id: z.string().optional(),
});

export async function POST(request: Request) {
  if (!verifyKapsoWebhook(request)) {
    await audit({ action: "kapso.webhook.rejected", level: "warn" });
    return jsonError("Firma inválida", 401);
  }
  let payload: z.infer<typeof inboundSchema>;
  try {
    payload = inboundSchema.parse(await request.json());
  } catch {
    return jsonError("Payload inválido", 422);
  }

  const eventType = payload.event ?? payload.type ?? "message";

  try {
    // Actualización de estado de mensaje saliente
    if (eventType.includes("status") && payload.data?.message_id) {
      const status = payload.data.status;
      const map: Record<string, "ENTREGADO" | "LEIDO" | "FALLIDO"> = {
        delivered: "ENTREGADO",
        read: "LEIDO",
        failed: "FALLIDO",
      };
      if (status && map[status]) {
        await db.message.updateMany({
          where: { providerMessageId: payload.data.message_id },
          data: {
            status: map[status],
            ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
            ...(status === "read" ? { readAt: new Date() } : {}),
          },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Mensaje entrante
    const phone = payload.data?.message?.from ?? payload.data?.contact?.phone ?? payload.from;
    const text = payload.data?.message?.body ?? payload.data?.message?.text ?? payload.body;
    if (!phone || !text) {
      return NextResponse.json({ ok: true, skipped: "sin teléfono o texto" });
    }

    const result = await processInboundMessage({
      phone,
      text,
      providerMessageId: payload.data?.message?.id ?? payload.message_id,
      kapsoConversationId: payload.data?.conversation_id,
      contactName: payload.data?.contact?.name,
    });
    return NextResponse.json({ ok: true, result: result.handled });
  } catch (err) {
    await audit({
      action: "kapso.webhook.error",
      level: "error",
      detail: { error: String(err) },
    });
    // 200 para evitar reintentos infinitos del proveedor; el error queda auditado
    return NextResponse.json({ ok: false, error: "processing_error" });
  }
}
