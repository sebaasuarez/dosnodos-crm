import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError } from "@/lib/api";

export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const conversations = await db.conversation.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: {
        lead: { select: { id: true, companyName: true, contactName: true, phone: true, score: true, consentStatus: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return NextResponse.json({ conversations });
  } catch (err) {
    return handleApiError(err);
  }
}
