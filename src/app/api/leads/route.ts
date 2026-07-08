import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, handleApiError } from "@/lib/api";
import { enrichLead } from "@/lib/apify";
import { audit } from "@/lib/audit";
import type { Prisma, LeadStatus, ConsentStatus } from "@prisma/client";

export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const where: Prisma.LeadWhereInput = {};
    const q = url.searchParams.get("q");
    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ];
    }
    const status = url.searchParams.get("status");
    if (status) where.status = status as LeadStatus;
    const consent = url.searchParams.get("consent");
    if (consent) where.consentStatus = consent as ConsentStatus;
    const city = url.searchParams.get("city");
    if (city) where.city = city;
    const scoreMin = url.searchParams.get("scoreMin");
    if (scoreMin) where.score = { gte: Number(scoreMin) };

    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = 50;
    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.lead.count({ where }),
    ]);
    return NextResponse.json({ leads, total, page, pageSize });
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "COMERCIAL"]);
  if (!auth.ok) return auth.response;
  try {
    const data = createSchema.parse(await request.json());
    const lead = await db.lead.create({
      data: {
        companyName: data.companyName,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        website: data.website,
        city: data.city,
        category: data.category,
        hasWebsite: Boolean(data.website),
        hasEmail: Boolean(data.email),
        hasWhatsapp: Boolean(data.phone),
        source: "MANUAL",
        consentStatus: "SIN_CONSENTIMIENTO",
        ...(data.notes
          ? { notes: { create: { content: data.notes, authorId: auth.user.id } } }
          : {}),
      },
    });
    await enrichLead(lead.id);
    await audit({
      action: "lead.created.manual",
      actor: auth.user.email,
      userId: auth.user.id,
      entity: "lead",
      entityId: lead.id,
    });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
