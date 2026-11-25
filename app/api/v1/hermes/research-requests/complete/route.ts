import { NextResponse } from "next/server";
import { z } from "zod";
import { hermesAuth } from "../../hermes/auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

const CompleteRequestSchema = z.object({
  request_id: z.string().uuid(),
  run_id: z.string().min(1),
  status: z.enum(["completed", "cancelled"]),
  result_note: z.string().max(4000).optional(),
  findings: z
    .array(
      z.object({
        field: z.string().max(100),
        value: z.string().max(1000),
        verified: z.boolean().optional(),
        source_url: z.string().url().max(500).optional(),
      }),
    )
    .max(50)
    .optional(),
});

export async function POST(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const parsed = CompleteRequestSchema.parse(body);

    const [existing] = await hermesQuery(
      "select id, status from hermes.research_requests where id=$1",
      [parsed.request_id],
    );

    if (!existing) {
      return NextResponse.json(
        { error: "Research request not found." },
        { status: 404 },
      );
    }

    if ((existing as Record<string, unknown>).status !== "open" &&
        (existing as Record<string, unknown>).status !== "in_progress") {
      return NextResponse.json(
        { error: "Research request is already closed." },
        { status: 409 },
      );
    }

    const [row] = await hermesQuery(
      `update hermes.research_requests set
         status       = $2,
         completed_at = now(),
         result_note  = $3,
         data         = data || $4
       where id = $1
       returning id, status`,
      [
        parsed.request_id,
        parsed.status,
        parsed.result_note ?? null,
        JSON.stringify({ findings: parsed.findings ?? [], run_id: parsed.run_id }),
      ],
    );

    return NextResponse.json(
      {
        id: (row as Record<string, unknown>).id,
        status: (row as Record<string, unknown>).status,
        completed_at: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid completion payload", details: e.errors },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to complete request";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}