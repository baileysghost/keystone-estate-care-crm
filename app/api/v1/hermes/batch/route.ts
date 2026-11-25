import { NextResponse } from "next/server";
import { z } from "zod";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

// POST /api/v1/hermes/batch — submit grouped research results in one call
const SourceSchema = z.object({
  source_name: z.string().max(200),
  source_type: z
    .enum(["legal_notice", "court_site", "newspaper", "assessor", "state_bar", "other"])
    .optional(),
  source_url: z.string().url().max(500).optional(),
  date_published: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
});

const BatchLeadSchema = z.object({
  external_run_id: z.string().max(100).optional(),
  case_number: z.string().min(1).max(80),
  jurisdiction: z.string().max(120).optional(),
  property_city: z.string().max(120).optional(),
  property_county: z.string().max(120).optional(),
  estate_name: z.string().max(240).optional(),
  probate_stage: z.string().max(80).optional(),
  real_estate_involved: z.boolean().optional(),
  attorney: z
    .object({
      full_name: z.string().max(240).optional(),
      law_firm: z.string().max(240).optional(),
      professional_email: z.string().email().optional(),
      business_phone: z.string().max(40).optional(),
    })
    .optional(),
  sources: z.array(SourceSchema).optional(),
  idempotency_key: z.string().max(120).optional(),
});

const BatchAttorneySchema = z.object({
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

const BatchSchema = z.object({
  run_id: z.string().min(1),
  leads: z.array(BatchLeadSchema).max(100).optional(),
  attorneys: z.array(BatchAttorneySchema).max(100).optional(),
});

export async function POST(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  if (process.env.HERMES_INGESTION_ENABLED === "false") {
    return NextResponse.json(
      { error: "Batch ingestion is currently disabled." },
      { status: 403 },
    );
  }

  const startTime = Date.now();
  const results: {
    leads: { accepted: string[]; duplicates: string[]; rejected: { key: string; reason: string }[] };
    attorneys: { accepted: string[]; duplicates: string[]; rejected: { key: string; reason: string }[] };
    errors: string[];
  } = {
    leads: { accepted: [], duplicates: [], rejected: [] },
    attorneys: { accepted: [], duplicates: [], rejected: [] },
    errors: [],
  };

  try {
    const body = await request.json();
    const parsed = BatchSchema.parse(body);

    const jsonSize = new TextEncoder().encode(JSON.stringify(body)).length;
    if (jsonSize > 256 * 1024) {
      return NextResponse.json(
        { error: "Request body exceeds 256 KiB limit." },
        { status: 413 },
      );
    }

    // --- Process leads ---
    for (const lead of parsed.leads ?? []) {
      try {
        const key = lead.idempotency_key ?? `${lead.case_number}::${lead.jurisdiction ?? ""}`;

        if (lead.idempotency_key) {
          const [ex] = await hermesQuery(
            "select id from hermes.leads where idempotency_key=$1",
            [lead.idempotency_key],
          );
          if (ex) {
            results.leads.duplicates.push((ex as Record<string, unknown>).id as string);
            continue;
          }
        }

        if (lead.jurisdiction) {
          const [dup] = await hermesQuery(
            "select id from hermes.leads where case_number=$1 and jurisdiction=$2",
            [lead.case_number, lead.jurisdiction],
          );
          if (dup) {
            results.leads.duplicates.push((dup as Record<string, unknown>).id as string);
            continue;
          }
        }

        const [row] = await hermesQuery(
          `insert into hermes.leads(
             external_run_id, case_number, jurisdiction,
             property_city, property_county, estate_name,
             probate_stage, real_estate_involved,
             attorney_full_name, attorney_law_firm, attorney_email, attorney_phone,
             idempotency_key, data, status
           ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
           returning id`,
          [
            parsed.run_id,
            lead.case_number,
            lead.jurisdiction ?? null,
            lead.property_city ?? null,
            lead.property_county ?? null,
            lead.estate_name ?? null,
            lead.probate_stage ?? null,
            lead.real_estate_involved ?? null,
            lead.attorney?.full_name ?? null,
            lead.attorney?.law_firm ?? null,
            lead.attorney?.professional_email ?? null,
            lead.attorney?.business_phone ?? null,
            lead.idempotency_key ?? null,
            JSON.stringify({ attorney: lead.attorney, sources: lead.sources ?? [] }),
          ],
        );
        results.leads.accepted.push((row as Record<string, unknown>).id as string);
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Unknown error";
        results.leads.rejected.push({ key: lead.case_number, reason });
      }
    }

    // --- Process attorneys ---
    for (const att of parsed.attorneys ?? []) {
      try {
        if (att.idempotency_key) {
          const [ex] = await hermesQuery(
            "select id from hermes.attorneys where idempotency_key=$1",
            [att.idempotency_key],
          );
          if (ex) {
            results.attorneys.duplicates.push((ex as Record<string, unknown>).id as string);
            continue;
          }
        }

        if (att.full_name && att.law_firm) {
          const [dup] = await hermesQuery(
            "select id from hermes.attorneys where full_name=$1 and law_firm=$2",
            [att.full_name, att.law_firm],
          );
          if (dup) {
            results.attorneys.duplicates.push((dup as Record<string, unknown>).id as string);
            continue;
          }
        }

        const [row] = await hermesQuery(
          `insert into hermes.attorneys(
             full_name, bar_number, bar_status, law_firm,
             professional_email, business_phone, law_firm_website,
             business_address, probate_practice, estate_planning_practice,
             trust_admin_practice, geo_service_area, idempotency_key, status
           ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
           returning id`,
          [
            att.full_name, att.bar_number ?? null, att.bar_status ?? null,
            att.law_firm ?? null, att.professional_email ?? null,
            att.business_phone ?? null, att.law_firm_website ?? null,
            att.business_address ?? null,
            att.probate_practice ?? false, att.estate_planning_practice ?? false,
            att.trust_admin_practice ?? false, att.geo_service_area ?? null,
            att.idempotency_key ?? null,
          ],
        );
        results.attorneys.accepted.push((row as Record<string, unknown>).id as string);
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Unknown error";
        results.attorneys.rejected.push({ key: att.full_name, reason });
      }
    }

    return NextResponse.json(
      {
        run_id: parsed.run_id,
        leads_accepted: results.leads.accepted.length,
        leads_duplicates: results.leads.duplicates.length,
        leads_rejected: results.leads.rejected,
        attorneys_accepted: results.attorneys.accepted.length,
        attorneys_duplicates: results.attorneys.duplicates.length,
        attorneys_rejected: results.attorneys.rejected,
        processing_time_ms: Date.now() - startTime,
      },
      { status: 200 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid batch payload", details: e.errors },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : "Batch processing failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}