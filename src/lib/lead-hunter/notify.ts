import { audit } from "@/lib/audit";
import type { LeadHunterRunOutcome } from "./run";

/**
 * Notificación por email al terminar una corrida del Lead Hunter — usa la
 * API REST de Resend directamente (mismo patrón que `src/lib/kapso.ts`: sin
 * `RESEND_API_KEY`/`LEAD_HUNTER_NOTIFICATION_EMAIL` configurados, se omite en
 * silencio y queda registrado en auditoría; nunca lanza, para no romper el
 * resultado del cron/endpoint manual si el email falla).
 *
 * El correo solo incluye estado, fecha y conteos — nunca tokens, secretos ni
 * datos personales de los leads.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.LEAD_HUNTER_NOTIFICATION_EMAIL);
}

function statusLabel(status: LeadHunterRunOutcome["status"]): string {
  switch (status) {
    case "SUCCESS":
      return "✅ Completado";
    case "PARTIAL":
      return "⚠ Completado con errores parciales";
    case "FAILED":
      return "❌ Falló";
    default:
      return status;
  }
}

function buildHtml(outcome: LeadHunterRunOutcome, dashboardUrl: string): string {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; color: #1e293b;">
      <h2 style="margin-bottom: 4px;">Lead Hunter — ${statusLabel(outcome.status)}</h2>
      <p style="color:#64748b; margin-top:0;">Ejecución ${outcome.triggerType === "CRON" ? "automática (cron diario)" : "manual"} · ${outcome.startedAt}</p>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tbody>
          <tr><td style="padding:4px 8px; color:#64748b;">Búsquedas ejecutadas</td><td style="padding:4px 8px; text-align:right; font-weight:600;">${outcome.queriesExecuted}</td></tr>
          <tr><td style="padding:4px 8px; color:#64748b;">Resultados encontrados</td><td style="padding:4px 8px; text-align:right; font-weight:600;">${outcome.rawResults}</td></tr>
          <tr><td style="padding:4px 8px; color:#64748b;">Resultados válidos (con contacto)</td><td style="padding:4px 8px; text-align:right; font-weight:600;">${outcome.validResults}</td></tr>
          <tr><td style="padding:4px 8px; color:#64748b;">Leads creados</td><td style="padding:4px 8px; text-align:right; font-weight:700; color:#047857;">${outcome.created}</td></tr>
          <tr><td style="padding:4px 8px; color:#64748b;">Duplicados</td><td style="padding:4px 8px; text-align:right;">${outcome.duplicates}</td></tr>
          <tr><td style="padding:4px 8px; color:#64748b;">Inválidos (sin contacto)</td><td style="padding:4px 8px; text-align:right;">${outcome.invalid}</td></tr>
          <tr><td style="padding:4px 8px; color:#64748b;">Fallidos</td><td style="padding:4px 8px; text-align:right;">${outcome.failed}</td></tr>
        </tbody>
      </table>
      ${
        outcome.status !== "SUCCESS"
          ? `<p style="background:#fef2f2; color:#b91c1c; padding:8px 12px; border-radius:6px; font-size:13px;">Hubo errores durante la ejecución. Revisa el detalle en el dashboard.</p>`
          : ""
      }
      <p style="margin-top:16px;"><a href="${dashboardUrl}" style="color:#2563eb;">Ver detalle en el dashboard →</a></p>
      <p style="color:#94a3b8; font-size:12px;">Todos los leads capturados entran sin consentimiento de WhatsApp (SIN_CONSENTIMIENTO) y requieren opt-in antes de cualquier contacto.</p>
    </div>
  `;
}

export async function sendLeadHunterSummaryEmail(outcome: LeadHunterRunOutcome): Promise<void> {
  if (!isConfigured()) {
    await audit({
      action: "lead_hunter.notify.skipped",
      entity: "lead_hunter_execution",
      entityId: outcome.executionId,
      detail: { reason: "RESEND_API_KEY o LEAD_HUNTER_NOTIFICATION_EMAIL no configurados" },
    });
    return;
  }

  const dashboardUrl = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/lead-hunter`;
  const fromAddress = process.env.LEAD_HUNTER_FROM_EMAIL || "Dos Nodos CRM <notificaciones@dosnodos.com.co>";
  const subject = `Lead Hunter: ${outcome.created} leads nuevos — ${statusLabel(outcome.status)}`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [process.env.LEAD_HUNTER_NOTIFICATION_EMAIL],
        subject,
        html: buildHtml(outcome, dashboardUrl),
      }),
    });
    if (!res.ok) {
      await audit({
        action: "lead_hunter.notify.failed",
        level: "error",
        entity: "lead_hunter_execution",
        entityId: outcome.executionId,
        detail: { status: res.status },
      });
    }
  } catch (err) {
    await audit({
      action: "lead_hunter.notify.failed",
      level: "error",
      entity: "lead_hunter_execution",
      entityId: outcome.executionId,
      detail: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}
