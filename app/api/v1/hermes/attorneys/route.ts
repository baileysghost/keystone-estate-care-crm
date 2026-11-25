import { NextResponse } from "next/server";
import { z } from "zod";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

const AttorneySchema = z.object({
  full_name: z.string().min(1).max(240),
  bar_number: z.string().max(40).optional(),
  bar_status: z.string().max(40).optional(),
  law_firm: z.string().max(240).optional(),
  professional_email: z.string().email().optional(),
  business_phone: z.string().max(40).optional(),
  law_firm_website: z.string().url().max(500).optional(),
  business_address: z.string().max(500).optional(),
  probate_practice: z.boolean().optional(),
  estate_planning_practice: z.boolean().optional(),
  trust_admin_practice: z.boolean().optional(),
  geo_service_area: z.string().max(240).optional(),
  idempotency_key: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  if (process.env.HERMES_INGESTION_ENABLED === "false") {
    return NextResponse.json(
      { error: "Attorney ingestion is currently disabled." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const parsed = AttorneySchema.parse(body);

    // Idempotency
    if (parsed.idempotency_key) {
      const [existing] = await hermesQuery(
        "select id, status from hermes.attorneys where idempotency_key=$1",
        [parsed.idempotency_key],
      );
      if (existing) {
        return NextResponse.json(
          { id: (existing as Record<string, unknown>).id, status: (existing as Record<string, unknown>).status, duplicate: true },
          { status: 200 },
        );
      }
    }

    // Duplicate by name + firm
    if (parsed.full_name && parsed.law_firm) {
      const [dup] = await hermesQuery(
        "select id from hermes.attorneys where full_name=$1 and law_firm=$2",
        [parsed.full_name, parsed.law_firm],
      );
      if (dup) {
        return NextResponse.json(
          { id: (dup as Record<string, unknown>).id, status: "duplicate", message: "Attorney already on file." },
          { status: 200 },
        );
      }
    }

    const [row] = await hermesQuery(
      `insert into hermes.attorneys(
         full_name, bar_number, bar_status,
         law_firm, professional_email, business_phone,
         law_firm_website, business_address,
         probate_practice, estate_planning_practice, trust_admin_practice,
         geo_service_area, idempotency_key, status
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
       returning id, full_name, law_firm, status, submitted_at`,
      [
        parsed.full_name,
        parsed.bar_number ?? null,
        parsed.bar_status ?? null,
        parsed.law_firm ?? null,
        parsed.professional_email ?? null,
        parsed.business_phone ?? null,
        parsed.law_firm_website ?? null,
        parsed.business_address ?? null,
        parsed.probate_practice ?? false,
        parsed.estate_planning_practice ?? false,
        parsed.trust_admin_practice ?? false,
        parsed.geo_service_area ?? null,
        parsed.idempotency_key ?? null,
      ],
    );

    return NextResponse.json(
      {
        id: (row as Record<string, unknown>).id,
        full_name: (row as Record<string, unknown>).full_name,
        law_firm: (row as Record<string, unknown>).law_firm,
        status: (row as Record<string, unknown>).status,
        submitted_at: (row as Record<string, unknown>).submitted_at,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid attorney payload", details: e.errors },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to submit attorney";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/v1/hermes/attorneys
export async function GET(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const rows = await hermesQuery(
      "select * from hermes.attorneys order by submitted_at desc limit $1",
      [limit],
    );
    return NextResponse.json({ attorneys: rows, limit });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch attorneys";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}