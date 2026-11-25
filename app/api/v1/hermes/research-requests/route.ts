import { NextResponse } from "next/server";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

// GET /api/v1/hermes/research-requests
export async function GET(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "open";
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

    const rows = await hermesQuery(
      "select * from hermes.research_requests where status=$1 order by created_at asc limit $2",
      [status, limit],
    );

    return NextResponse.json(
      { research_requests: rows, count: rows.length },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch research requests";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}