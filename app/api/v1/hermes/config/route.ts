import { NextResponse } from "next/server";
import { hermesAuth } from "../../auth.mts";
import { hermesQuery } from "../../../../lib/hermes-db.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = hermesAuth(request);
  if (denied) return denied;

  try {
    const [cfg] = await hermesQuery(
      "select key, value from hermes.config",
    );

    const territories = await hermesQuery(
      "select value->>'name' as name, value->>'tier' as tier from hermes.config where key='service_territories'",
    );

    const defaults = await hermesQuery(
      "select value from hermes.config where key='research_defaults'",
    );

    return NextResponse.json(
      {
        service_territories: territories.map((t) => ({
          name: t.name,
          tier: Number(t.tier),
        })),
        research_defaults: defaults[0]?.value ?? {},
        ingestion_enabled: process.env.HERMES_INGESTION_ENABLED !== "false",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load config";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}