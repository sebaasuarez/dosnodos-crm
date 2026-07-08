import { NextResponse } from "next/server";
import { requireApiSession, handleApiError } from "@/lib/api";
import { enrichLead } from "@/lib/apify";

/** Recalcula score y recomendación del lead. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const lead = await enrichLead(id);
    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}
