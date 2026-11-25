import { NextResponse } from "next/server";
import { z } from "zod";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

const StartRunSchema = z.object({
  run_id: z.string().min(1).max(100),
  agent_version: z.string().optional(),
  research_types: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const parsed = StartRunSchema.parse(body);

    // Check for duplicate run_id
    const existing = await hermesQuery(
      "select id, status from hermes.research_runs where run_id=$1",
      [parsed.run_id],
    );

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error: "A research run with this run_id already exists.",
          existing_id: existing[0].id,
          existing_status: (existing[0] as Record<string, unknown>).status,
        },
        { status: 409 },
      );
    }

    const [row] = await hermesQuery(
      `insert into hermes.research_runs(run_id, status)
       values($1, 'running')
       returning id, run_id, status, started_at`,
      [parsed.run_id],
    );

    return NextResponse.json(
      {
        id: (row as Record<string, unknown>).id,
        run_id: (row as Record<string, unknown>).run_id,
        status: (row as Record<string, unknown>).status,
        started_at: (row as Record<string, unknown>).started_at,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: e.errors },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to start run";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}