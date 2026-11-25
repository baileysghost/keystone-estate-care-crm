import { NextResponse } from "next/server";
import { z } from "zod";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

const RunResultSchema = z.object({
  run_id: z.string().min(1),
  status: z.enum(["completed", "partial", "failed"]),
  completed_at: z.string().datetime().optional(),
  sources_checked: z.number().int().min(0).optional(),
  sources_unavailable: z.number().int().min(0).optional(),
  cases_discovered: z.number().int().min(0).optional(),
  leads_created: z.number().int().min(0).optional(),
  leads_updated: z.number().int().min(0).optional(),
  duplicates_prevented: z.number().int().min(0).optional(),
  attorneys_created: z.number().int().min(0).optional(),
  attorneys_updated: z.number().int().min(0).optional(),
  requests_completed: z.number().int().min(0).optional(),
  validation_failures: z.number().int().min(0).optional(),
  api_failures: z.number().int().min(0).optional(),
  retry_queue_size: z.number().int().min(0).optional(),
  ai_cost_usd: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const parsed = RunResultSchema.parse(body);

    const [existing] = await hermesQuery(
      "select id from hermes.research_runs where run_id=$1",
      [parsed.run_id],
    );

    if (!existing) {
      return NextResponse.json(
        { error: "No research run found with this run_id." },
        { status: 404 },
      );
    }

    const completedAt =
      parsed.completed_at ?? new Date().toISOString();

    const [row] = await hermesQuery(
      `update hermes.research_runs set
         status          = $2,
         completed_at    = $3,
         sources_checked  = coalesce($4, sources_checked),
         sources_unavailable = coalesce($5, sources_unavailable),
         cases_discovered = coalesce($6, cases_discovered),
         leads_created   = coalesce($7, leads_created),
         leads_updated   = coalesce($8, leads_updated),
         duplicates_prevented = coalesce($9, duplicates_prevented),
         attorneys_created = coalesce($10, attorneys_created),
         attorneys_updated = coalesce($11, attorneys_updated),
         requests_completed = coalesce($12, requests_completed),
         validation_failures = coalesce($13, validation_failures),
         api_failures     = coalesce($14, api_failures),
         retry_queue_size  = coalesce($15, retry_queue_size),
         ai_cost_usd       = coalesce($16, ai_cost_usd),
         notes             = coalesce($17, notes)
       where run_id = $1
       returning id, run_id, status`,
      [
        parsed.run_id,
        parsed.status,
        completedAt,
        parsed.sources_checked,
        parsed.sources_unavailable,
        parsed.cases_discovered,
        parsed.leads_created,
        parsed.leads_updated,
        parsed.duplicates_prevented,
        parsed.attorneys_created,
        parsed.attorneys_updated,
        parsed.requests_completed,
        parsed.validation_failures,
        parsed.api_failures,
        parsed.retry_queue_size,
        parsed.ai_cost_usd,
        parsed.notes ?? null,
      ],
    );

    return NextResponse.json({
      id: (row as Record<string, unknown>).id,
      run_id: (row as Record<string, unknown>).run_id,
      status: (row as Record<string, unknown>).status,
      completed_at: completedAt,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: e.errors },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to complete run";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}