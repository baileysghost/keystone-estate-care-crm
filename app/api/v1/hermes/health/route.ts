import { NextResponse } from "next/server";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const ingestionEnabled =
      process.env.HERMES_INGESTION_ENABLED !== "false";

    // Check database connectivity
    let dbHealthy = false;
    try {
      const rows = await hermesQuery(
        "select 1 as healthy, current_timestamp as ts",
      );
      dbHealthy = rows.length === 1 && rows[0].healthy === 1;
    } catch {
      dbHealthy = false;
    }

    const healthy = dbHealthy && ingestionEnabled;

    return NextResponse.json(
      {
        status: healthy ? "ok" : "degraded",
        ingestion_enabled: ingestionEnabled,
        database_connected: dbHealthy,
        timestamp: new Date().toISOString(),
      },
      {
        status: healthy ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Health check failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}