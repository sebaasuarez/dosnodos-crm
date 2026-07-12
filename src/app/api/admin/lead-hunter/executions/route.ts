import { NextResponse } from "next/server";
import { requireApiSession, handleApiError } from "@/lib/api";
import { db } from "@/lib/db";
import type { LeadHunterExecutionStatus } from "@prisma/client";

const VALID_STATUSES: LeadHunterExecutionStatus[] = ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"];

/** Historial de ejecuciones del Lead Hunter, con filtros por estado y rango de fecha. */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const executions = await db.leadHunterExecution.findMany({
      where: {
        status: status && VALID_STATUSES.includes(status as LeadHunterExecutionStatus)
          ? (status as LeadHunterExecutionStatus)
          : undefined,
        startedAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ executions });
  } catch (err) {
    return handleApiError(err);
  }
}
