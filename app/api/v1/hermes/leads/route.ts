import { NextResponse } from "next/server";
import { z } from "zod";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

// POST /api/v1/hermes/leads — submit a single probate lead
const LeadSchema = z.object({
  external_run_id: z.string().max(100).optional(),
  case_number: z.string().min(1).max(80),
  jurisdiction: z.string().max(120).optional(),
  property_city: z.string().max(120).optional(),
  property_county: z.string().max(120).optional(),
  estate_name: z.string().max(240).optional(),
  probate_stage: z.string().max(80).optional(),
  real_estate_involved: z.boolean().optional(),
  lead_score: z.number().int().min(0).max(100).optional(),
  attorney: z
    .object({
      full_name: z.string().max(240).optional(),
      law_firm: z.string().max(240).optional(),
      professional_email: z.string().email().optional(),
      business_phone: z.string().max(40).optional(),
    })
    .optional(),
  sources: z
    .array(
      z.object({
        source_name: z.string().max(200),
        source_type: z
          .enum(["legal_notice", "court_site", "newspaper", "assessor", "state_bar", "other"])
          .optional(),
        source_url: z.string().url().max(500).optional(),
        date_published: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
      }),
    )
    .optional(),
  idempotency_key: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  if (process.env.HERMES_INGESTION_ENABLED === "false") {
    return NextResponse.json(
      { error: "Lead ingestion is currently disabled." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const parsed = LeadSchema.parse(body);

    // Idempotency: if same idempotency_key, return existing record
    if (parsed.idempotency_key) {
      const [existing] = await hermesQuery(
        "select id, case_number, status from hermes.leads where idempotency_key=$1",
        [parsed.idempotency_key],
      );
      if (existing) {
        return NextResponse.json(
          {
            id: (existing as Record<string, unknown>).id,
            status: (existing as Record<string, unknown>).status,
            duplicate: true,
          },
          { status: 200 },
        );
      }
    }

    // Duplicate check by case_number + jurisdiction
    if (parsed.jurisdiction) {
      const [dup] = await hermesQuery(
        "select id from hermes.leads where case_number=$1 and jurisdiction=$2",
        [parsed.case_number, parsed.jurisdiction],
      );
      if (dup) {
        return NextResponse.json(
          {
            id: (dup as Record<string, unknown>).id,
            status: "duplicate",
            message: "Duplicate case detected.",
          },
          { status: 200 },
        );
      }
    }

    const data = {
      attorney: parsed.attorney ?? null,
      sources: parsed.sources ?? [],
    };

    const [row] = await hermesQuery(
      `insert into hermes.leads(
         external_run_id, case_number, jurisdiction,
         property_city, property_county, estate_name,
         probate_stage, real_estate_involved, lead_score,
         attorney_full_name, attorney_law_firm, attorney_email, attorney_phone,
         idempotency_key, data, status
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending')
       returning id, case_number, status, submitted_at`,
      [
        parsed.external_run_id ?? null,
        parsed.case_number,
        parsed.jurisdiction ?? null,
        parsed.property_city ?? null,
        parsed.property_county ?? null,
        parsed.estate_name ?? null,
        parsed.probate_stage ?? null,
        parsed.real_estate_involved ?? null,
        parsed.lead_score ?? null,
        parsed.attorney?.full_name ?? null,
        parsed.attorney?.law_firm ?? null,
        parsed.attorney?.professional_email ?? null,
        parsed.attorney?.business_phone ?? null,
        parsed.idempotency_key ?? null,
        JSON.stringify(data),
      ],
    );

    return NextResponse.json(
      {
        id: (row as Record<string, unknown>).id,
        case_number: (row as Record<string, unknown>).case_number,
        status: (row as Record<string, unknown>).status,
        submitted_at: (row as Record<string, unknown>).submitted_at,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid lead payload", details: e.errors },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to submit lead";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/v1/hermes/leads — list recent leads
export async function GET(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const offset = Number(searchParams.get("offset") ?? 0);
    const status = searchParams.get("status");

    let sql = "select * from hermes.leads";
    const args: unknown[] = [];
    if (status) {
      sql += " where status=$1";
      args.push(status);
    }
    sql += ` order by submitted_at desc limit $${args.length + 1} offset $${args.length + 2}`;
    args.push(limit, offset);

    const rows = await hermesQuery(sql, args);

    return NextResponse.json(
      { leads: rows, limit, offset },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch leads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}