import { NextResponse } from "next/server";
import { requireApiSession, handleApiError, jsonError } from "@/lib/api";
import { db } from "@/lib/db";

/** Detalle de una ejecución del Lead Hunter, con los leads que produjo. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const execution = await db.leadHunterExecution.findUnique({
      where: { id },
      include: {
        leads: {
          select: {
            id: true,
            companyName: true,
            city: true,
            category: true,
            phone: true,
            email: true,
            score: true,
            recommendedService: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!execution) return jsonError("Ejecución no encontrada", 404);

    return NextResponse.json({ execution });
  } catch (err) {
    return handleApiError(err);
  }
}
