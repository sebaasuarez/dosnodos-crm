import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { handleApiError, jsonError } from "@/lib/api";
import { enrichLead } from "@/lib/apify";

/**
 * Endpoint público para formularios de la landing (ventas.dosnodos.com.co).
 * Protegido con LANDING_FORM_TOKEN en el header `x-form-token`.
 *
 * Si el formulario incluye la casilla de consentimiento de WhatsApp marcada
 * (whatsappConsent=true), el lead entra con OPT_IN trazable.
 */

const schema = z.object({
  name: z.string().min(1),
  businessName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  message: z.string().optional(),
  whatsappConsent: z.boolean().default(false),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  sourceUrl: z.string().optional(),
});

export async function POST(request: Request) {
  const token = process.env.LANDING_FORM_TOKEN;
  if (token && request.headers.get("x-form-token") !== token) {
    return jsonError("Token inválido", 401);
  }
  try {
    const data = schema.parse(await request.json());

    // Dedupe por teléfono o email
    const existing = data.phone || data.email
      ? await db.lead.findFirst({
          where: {
            OR: [
              ...(data.phone ? [{ phone: data.phone }] : []),
              ...(data.email ? [{ email: data.email }] : []),
            ],
          },
        })
      : null;

    const consent = data.whatsappConsent && data.phone;
    let leadId: string;

    if (existing) {
      leadId = existing.id;
      await db.lead.update({
        where: { id: existing.id },
        data: {
          contactName: existing.contactName ?? data.name,
          email: existing.email ?? data.email,
          utmSource: data.utmSource ?? existing.utmSource,
          utmCampaign: data.utmCampaign ?? existing.utmCampaign,
          ...(consent && existing.consentStatus !== "OPT_OUT"
            ? { consentStatus: "OPT_IN", optInDate: new Date(), status: "CONTACTO_PERMITIDO" }
            : {}),
        },
      });
    } else {
      const lead = await db.lead.create({
        data: {
          companyName: data.businessName ?? data.name,
          contactName: data.name,
          phone: data.phone,
          email: data.email,
          hasWhatsapp: Boolean(data.phone),
          hasEmail: Boolean(data.email),
          source: "LANDING_FORM",
          sourceUrl: data.sourceUrl,
          utmSource: data.utmSource,
          utmMedium: data.utmMedium,
          utmCampaign: data.utmCampaign,
          utmContent: data.utmContent,
          status: consent ? "CONTACTO_PERMITIDO" : "PENDIENTE_CONSENTIMIENTO",
          consentStatus: consent ? "OPT_IN" : "PENDIENTE",
          optInDate: consent ? new Date() : undefined,
          ...(data.message
            ? { notes: { create: { content: `Mensaje del formulario: ${data.message}` } } }
            : {}),
        },
      });
      leadId = lead.id;
      await enrichLead(lead.id);
    }

    if (consent) {
      await db.consentEvent.create({
        data: {
          leadId,
          type: "OPT_IN",
          channel: "landing",
          source: data.sourceUrl ?? "formulario landing",
          evidence: `Casilla de consentimiento marcada. UTM: ${data.utmSource ?? "-"}/${data.utmCampaign ?? "-"}`,
        },
      });
    }

    await audit({
      action: "lead.captured.landing",
      entity: "lead",
      entityId: leadId,
      detail: { consent: Boolean(consent), utmSource: data.utmSource },
    });
    return NextResponse.json({ ok: true, leadId }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
