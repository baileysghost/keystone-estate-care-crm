import { useState } from "react";
import Papa from "papaparse";
import { exportCsv, openLead } from "../lib/view";
import { money, type Row, type Snapshot } from "../lib/model";
export default function Reports({ db }: { db: Snapshot }) {
  const [from, start] = useState(""),
    [to, end] = useState("");
  const rows = db.rows.filter(
    (r) =>
      !r.archived &&
      (!from || r.created_at.slice(0, 10) >= from) &&
      (!to || r.created_at.slice(0, 10) <= to),
  );
  const leads = rows.filter((r) => r.kind === "lead"),
    cust = rows.filter((r) => r.kind === "customer"),
    props = rows.filter((r) => r.kind === "property"),
    tasks = rows.filter(
      (r) => r.kind === "task" && r.data.category === "Follow-up",
    );
  const won = leads.filter((r) => r.data.status === "Won").length;
  const groups: { title: string; series: [string, number][] }[] = [];
  function group(title: string, list: Row[], values: (r: Row) => string[]) {
    const m = new Map<string, number>();
    for (const r of list)
      for (const k of values(r)) m.set(k, (m.get(k) || 0) + 1);
    groups.push({
      title,
      series: [...m.entries()].sort((a, b) => b[1] - a[1]),
    });
  }
  group("Leads by source", leads, (r) => [r.data.source || "Unspecified"]);
  group(
    "Opportunity outcomes",
    leads.filter((r) => ["Won", "Lost"].includes(r.data.status)),
    (r) => [r.data.status],
  );
  group("Customer growth by month", cust, (r) => [
    (r.data.customer_since || r.created_at).slice(0, 7),
  ]);
  group("Customer status", cust, (r) => [r.data.status || "Unspecified"]);
  group("Customers by service", cust, (r) =>
    r.services.length ? r.services : ["Unassigned"],
  );
  group("Properties by service", props, (r) =>
    r.services.length ? r.services : ["Unassigned"],
  );
  group(
    "Employee activity",
    rows.filter((r) => r.kind === "activity"),
    (r) => [db.rows.find((x) => x.id === r.employee_id)?.name || "Unassigned"],
  );
  const metrics = [
    ["Total leads", leads.length],
    ["Conversion rate", Math.round((100 * won) / (leads.length || 1)) + "%"],
    [
      "Pipeline value",
      money(
        leads.filter(openLead).reduce((s, r) => s + (+r.data.value || 0), 0),
      ),
    ],
    [
      "Follow-ups completed",
      Math.round(
        (100 * tasks.filter((r) => r.data.status === "Completed").length) /
          (tasks.length || 1),
      ) + "%",
    ],
  ];
  return (
    <>
      <div className="tools panel">
        <label>
          Created from
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => start(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => end(e.target.value)}
          />
        </label>
        <button
          onClick={() =>
            exportCsv(
              "keystone-report",
              Papa.unparse(
                [
                  ["Report", "Group", "Value"],
                  ...metrics.map(([k, v]) => [k, "", v]),
                  ...groups.flatMap((g) =>
                    g.series.map(([k, v]) => [g.title, k, v]),
                  ),
                ],
                { escapeFormulae: true },
              ),
            )
          }
        >
          Export report CSV
        </button>
      </div>
      <div className="metrics">
        {metrics.map(([k, v]) => (
          <div className="metric" key={k}>
            <small>{k}</small>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <div className="dashboardgrid">
        {groups.map((g) => (
          <section className="panel" key={g.title}>
            <div className="panelhead">
              <h2>{g.title}</h2>
            </div>
            <div className="bars">
              {g.series.map(([k, v]) => (
                <div key={k}>
                  <span>
                    {k}
                    <b>{v}</b>
                  </span>
                  <progress
                    value={v}
                    max={Math.max(...g.series.map((i) => i[1]))}
                  />
                </div>
              ))}
              {!g.series.length && <small>No records in this period.</small>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
