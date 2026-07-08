import { audit } from "@/lib/audit";

/**
 * Cliente HTTP para Kapso (WhatsApp Business).
 * Sin KAPSO_API_KEY corre en modo simulado: registra el envío y devuelve un ID mock,
 * para poder probar todo el flujo end-to-end sin cuenta real.
 */

const KAPSO_API_URL = () => process.env.KAPSO_API_URL ?? "https://app.kapso.ai/api/v1";

type KapsoSendResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  simulated: boolean;
};

function isConfigured() {
  return Boolean(process.env.KAPSO_API_KEY && process.env.KAPSO_PHONE_NUMBER_ID);
}

async function kapsoFetch(path: string, body: unknown): Promise<Response> {
  return fetch(`${KAPSO_API_URL()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.KAPSO_API_KEY ?? "",
    },
    body: JSON.stringify(body),
  });
}

export async function sendWhatsAppText(phone: string, text: string): Promise<KapsoSendResult> {
  if (!isConfigured()) {
    const id = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await audit({
      action: "kapso.send.simulated",
      detail: { phone, preview: text.slice(0, 120) },
    });
    return { ok: true, providerMessageId: id, simulated: true };
  }
  try {
    const res = await kapsoFetch("/whatsapp/messages", {
      phone_number_id: process.env.KAPSO_PHONE_NUMBER_ID,
      to: phone,
      type: "text",
      text: { body: text },
    });
    if (!res.ok) {
      const errBody = await res.text();
      await audit({
        action: "kapso.send.error",
        level: "error",
        detail: { phone, status: res.status, body: errBody.slice(0, 500) },
      });
      return { ok: false, error: `Kapso HTTP ${res.status}`, simulated: false };
    }
    const data = (await res.json()) as { id?: string; message_id?: string };
    return { ok: true, providerMessageId: data.id ?? data.message_id, simulated: false };
  } catch (err) {
    await audit({
      action: "kapso.send.error",
      level: "error",
      detail: { phone, error: String(err) },
    });
    return { ok: false, error: String(err), simulated: false };
  }
}

export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  variables: Record<string, string>,
): Promise<KapsoSendResult> {
  if (!isConfigured()) {
    const id = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await audit({
      action: "kapso.template.simulated",
      detail: { phone, templateName, variables },
    });
    return { ok: true, providerMessageId: id, simulated: true };
  }
  try {
    const res = await kapsoFetch("/whatsapp/messages", {
      phone_number_id: process.env.KAPSO_PHONE_NUMBER_ID,
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: Object.values(variables).map((v) => ({ type: "text", text: v })),
          },
        ],
      },
    });
    if (!res.ok) {
      return { ok: false, error: `Kapso HTTP ${res.status}`, simulated: false };
    }
    const data = (await res.json()) as { id?: string; message_id?: string };
    return { ok: true, providerMessageId: data.id ?? data.message_id, simulated: false };
  } catch (err) {
    return { ok: false, error: String(err), simulated: false };
  }
}

/** Reemplaza variables {{nombre}} en el cuerpo de una plantilla. */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

/** Verifica la firma del webhook de Kapso (header x-kapso-signature o secreto compartido). */
export function verifyKapsoWebhook(request: Request): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true; // sin secreto configurado no se puede verificar (solo dev)
  const header =
    request.headers.get("x-kapso-signature") ?? request.headers.get("x-webhook-secret");
  return header === secret;
}
