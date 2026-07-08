import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type AuditInput = {
  actor?: string; // "system" | "ai" | email del usuario
  userId?: string;
  action: string; // p.ej. "lead.created", "message.blocked"
  entity?: string;
  entityId?: string;
  detail?: Prisma.InputJsonValue;
  level?: "info" | "warn" | "error";
};

/** Registro central de auditoría. Nunca lanza: un fallo de log no debe romper el flujo. */
export async function audit(input: AuditInput) {
  try {
    await db.auditLog.create({
      data: {
        actor: input.actor ?? "system",
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        detail: input.detail,
        level: input.level ?? "info",
      },
    });
  } catch (err) {
    console.error("[audit] fallo al escribir log:", err);
  }
}
