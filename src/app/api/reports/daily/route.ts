import { NextResponse } from "next/server";
import { dashboardSummary } from "@/lib/reports";
import { requireApiSession, handleApiError } from "@/lib/api";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const summary = await dashboardSummary();
    return NextResponse.json(summary.daily);
  } catch (err) {
    return handleApiError(err);
  }
}
