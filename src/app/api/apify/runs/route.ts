import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError } from "@/lib/api";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const runs = await db.apifyRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
    return NextResponse.json({ runs });
  } catch (err) {
    return handleApiError(err);
  }
}
