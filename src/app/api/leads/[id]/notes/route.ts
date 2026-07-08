import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError } from "@/lib/api";

const schema = z.object({ content: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL", "MARKETING"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const { content } = schema.parse(await request.json());
    const note = await db.note.create({
      data: { leadId: id, content, authorId: auth.user.id },
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
