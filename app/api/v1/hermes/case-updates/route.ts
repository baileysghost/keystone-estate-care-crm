import { NextResponse } from "next/server";
import { z } from "zod";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

const CaseUpdateSchema = z.object({
  run_id: z.string().min(1),
  hermes_lead_id: z.string().uuid().optional(),
  case_number: z.string().max(80).optional(),
  jurisdiction: z.string().max(120).optional(),
  update_type: z.enum([
    "status_change",
    "attorney_change",
    "hearing_scheduled",
    "real_estate_confirmed",
    "property_city_confirmed",
    "other",
  ]),
  previous_value: z.string().max(500).optional(),
  new_value: z.string().max(500).optional(),
  source_url: z.string().url().max(500).optional(),
  source_name: z.string().max(200).optional(),
  data: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const parsed = CaseUpdateSchema.parse(body);

    let leadId = parsed.hermes_lead_id;

    // Resolve lead by case_number + jurisdiction if not provided directly
    if (!leadId && parsed.case_number) {
      const [found] = await hermesQuery(
        "select id from hermes.leads where case_number=$1 and jurisdiction=$2 limit 1",
        [parsed.case_number, parsed.jurisdiction ?? null],
      );
      if (!found) {
        return NextResponse.json(
          { error: "No matching lead found for this case_number and jurisdiction." },
          { status: 404 },
        );
      }
      leadId = (found as Record<string, unknown>).id as string;
    }

    const [row] = await hermesQuery(
      `insert into hermes.case_updates(
         hermes_lead_id, run_id, update_type,
         previous_value, new_value, source_url, source_name, data
       ) values($1,$2,$3,$4,$5,$6,$7,$8)
       returning id, update_type, created_at`,
      [
        leadId ?? null,
        parsed.run_id,
        parsed.update_type,
        parsed.previous_value ?? null,
        parsed.new_value ?? null,
        parsed.source_url ?? null,
        parsed.source_name ?? null,
        JSON.stringify(parsed.data ?? {}),
      ],
    );

    // Also update the lead record with the new city/status if relevant
    if (leadId) {
      const updates: string[] = [];
      const args: unknown[] = [leadId];
      let argIdx = 2;

      if (parsed.update_type === "property_city_confirmed" && parsed.new_value) {
        updates.push(`property_city = $${argIdx++}`);
        args.push(parsed.new_value);
      }
      if (parsed.update_type === "status_change" && parsed.new_value) {
        updates.push(`probate_stage = $${argIdx++}`);
        args.push(parsed.new_value);
      }
      if (parsed.update_type === "real_estate_confirmed" && parsed.new_value) {
        updates.push(`real_estate_involved = $${argIdx++}`);
        args.push(parsed.new_value === "true" || parsed.new_value === "1");
      }

      if (updates.length > 0) {
        await hermesQuery(
          `update hermes.leads set ${updates.join(", ")} where id = $1`,
          args,
        );
      }
    }

    return NextResponse.json(
      {
        id: (row as Record<string, unknown>).id,
        update_type: (row as Record<string, unknown>).update_type,
        created_at: (row as Record<string, unknown>).created_at,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid update payload", details: e.errors },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to record case update";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}