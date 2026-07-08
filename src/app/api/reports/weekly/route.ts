import { NextResponse } from "next/server";
import { weeklyReport } from "@/lib/reports";
import { requireApiSession, handleApiError } from "@/lib/api";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await weeklyReport());
  } catch (err) {
    return handleApiError(err);
  }
}
