import { ingest, settings } from "./hermes-store.mjs";
import { stages } from "./hermes-schema.mjs";
export async function seedDemo(q) {
  const config = await settings(q),
    now = Date.now(),
    day = (n) => new Date(now - n * 86400000).toISOString();
  for (let i = 0; i < 10; i++) {
    const j = i % 5,
      firm = j % 3,
      ref = {
        source_name: "Fictional legal notice",
        source_url: "https://example.com/notices/" + i,
        source_type: "demonstration",
      };
    const input = {
      case_number: "DEMO-2026-" + String(i + 1).padStart(5, "0"),
      jurisdiction: "Demonstration County",
      courthouse: "Fictional Probate Court",
      filing_date: day(i * 8).slice(0, 10),
      verification_status: i % 3 ? "verified" : "research_required",
      real_estate_status: i % 3 ? "confirmed" : "unknown",
      property_city: config.territory[i % config.territory.length],
      research_summary: "Fictional probate training record.",
      sources: [ref],
      attorney: {
        full_name: [
          "Avery Example",
          "Blair Example",
          "Casey Example",
          "Drew Example",
          "Ellis Example",
        ][j],
        law_firm: [
          "Example Coast Law",
          "Example Harbor Law",
          "Example Peninsula Law",
        ][firm],
        professional_email: "attorney" + j + "@example.com",
        business_phone: "310-555-010" + j,
        contact_verified: true,
      },
    };
    const r = await ingest(q, input, config, false, true);
    if (i === 0) await ingest(q, input, config, false, true);
    if (r.created) {
      await q(
        "update probate_cases set stage=$2, first_discovered_at=$3 where id=$1",
        [r.id, stages[i], day(i)],
      );
      if (i % 3 === 0)
        await q(
          "insert into probate_tasks(case_id,title,due) values($1,'Fictional attorney follow-up',$2)",
          [r.id, day(i).slice(0, 10)],
        );
    }
  }
  for (let i = 0; i < 7; i++)
    await q(
      "insert into hermes_runs(external_run_id,status,started_at,completed_at,data,demo) values($1,$2,$3,$4,$5::text::jsonb,true) on conflict do nothing",
      [
        "demo-run-" + i,
        i === 3 ? "failed" : i === 5 ? "warnings" : "completed",
        day(i + 0.01),
        day(i),
        JSON.stringify({
          sources_checked: 4,
          leads_created: i % 3,
          duplicates_prevented: 1,
          errors_count: i === 3 ? 1 : 0,
        }),
      ],
    );
}
export async function removeDemo(q) {
  for (const table of [
    "research_requests",
    "probate_cases",
    "attorneys",
    "law_firms",
    "hermes_runs",
  ])
    await q("delete from " + table + " where demo");
}
