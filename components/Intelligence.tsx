"use client";
import { useCallback, useEffect, useState } from "react";
import { stages, relationships } from "../lib/hermes-schema.mjs";
type Bag = Record<string, string>;
interface Case {
  id: string;
  data: Bag;
  first_discovered_at: string;
  updated_at: string;
  last_verified_at: string | null;
  stage: string;
  lead_score: number;
  score_breakdown: Record<string, number>;
  assigned_employee_id: string | null;
  reviewed: boolean;
  archived: boolean;
  client_id: string | null;
}
interface Person {
  id: string;
  full_name: string;
  law_firm_id: string;
  data: Bag;
  staff: Bag;
  created_at: string;
}
interface Data {
  active_properties: number;
  cases: Case[];
  attorneys: Person[];
  firms: { id: string; firm_name: string; data: Bag }[];
  linked: { case_id: string; attorney_id: string }[];
  runs: {
    id: string;
    external_run_id: string;
    status: string;
    started_at: string;
    completed_at: string;
    data: Bag;
  }[];
  tasks: {
    id: string;
    title: string;
    case_id: string;
    due: string;
    completed: boolean;
  }[];
  sources: {
    case_id: string;
    attorney_id: string;
    source_url: string;
    data: Bag;
    date_retrieved: string;
  }[];
  activity: {
    id: string;
    case_id: string;
    attorney_id: string;
    action: string;
    detail: string;
    actor: string;
    created_at: string;
  }[];
  config: {
    enabled: boolean;
    territory: string[];
    sources: string[];
    expansion: string[];
    weights: Record<string, number>;
  };
  employees: { id: string; name: string }[];
  access: { email: string; role: string; enabled: boolean }[];
  user: { role: string; employee_id: string; email: string };
}
const tz = "America/Los_Angeles",
  day = (v: string | Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(v)),
  when = (v: string | null) =>
    v ? new Date(v).toLocaleString("en-US", { timeZone: tz }) : "Unknown";
const title = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const group = (arr: string[]) =>
  Object.entries(
    arr.reduce<Record<string, number>>(
      (a, v) => ((a[v] = (a[v] || 0) + 1), a),
      {},
    ),
  );
const inbox = [
  "All",
  "Today",
  "Yesterday",
  "This week",
  "Unreviewed",
  "High priority",
  "Needs verification",
  "Assigned to me",
  "Archived",
];
function Facts({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="facts">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <dt>{title(k)}</dt>
          <dd>
            {Array.isArray(v)
              ? v.join(", ")
              : typeof v === "object"
                ? JSON.stringify(v)
                : String(v ?? "Unknown")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export default function Intelligence({ page }: { page: string }) {
  const [db, D] = useState<Data | null>(null),
    [demo, Demo] = useState(false),
    [message, M] = useState(""),
    [search, S] = useState(""),
    [filter, F] = useState("All"),
    [sort, O] = useState("Discovered"),
    [selected, I] = useState<string[]>([]),
    [detail, V] = useState(""),
    [view, B] = useState(false),
    [range, R] = useState("30"),
    [stage, T] = useState(stages[0]),
    [employee, E] = useState(""),
    [note, N] = useState(""),
    [due, U] = useState(""),
    [relation, H] = useState(relationships[0]),
    [setting, K] = useState("territory"),
    [edit, A] = useState(""),
    [role, G] = useState("employee"),
    [recipient, Recipient] = useState(""),
    [mergeTarget, Merge] = useState("");
  const refresh = useCallback(async () => {
    const r = await fetch("/api/intelligence?demo=" + demo, {
      cache: "no-store",
    });
    if (r.status === 401) {
      location.assign("/login");
      return;
    }
    if (!r.ok) throw Error("Unable to load probate records.");
    D(await r.json());
  }, [demo]);
  useEffect(() => {
    let active = true;
    const load = () => refresh().catch((e) => active && M(e.message));
    void load();
    const t = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [refresh]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    try {
      const r = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids: detail ? [detail] : selected,
          ...extra,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw Error(json.error);
      M(
        action === "run"
          ? "Request queued. Waiting for Hermes to poll."
          : action === "test"
            ? "Authenticated health check passed."
            : "Saved.",
      );
      await refresh();
    } catch (e) {
      M((e as Error).message);
    }
  }
  const toggle = (id: string) =>
    I((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  if (!db)
    return (
      <section className="panel" role="status">
        {message || "Loading probate intelligence…"}
      </section>
    );
  const admin = db.user.role === "administrator",
    today = day(new Date()),
    since = (v: string, n: number) =>
      (Date.parse(today) - Date.parse(day(v))) / 86400000 < n;
  const filtered = db.cases
    .filter(
      (c) =>
        (filter === "Archived" ? c.archived : !c.archived) &&
        JSON.stringify(c.data).toLowerCase().includes(search.toLowerCase()) &&
        (filter === "Today"
          ? day(c.first_discovered_at) === today
          : filter === "Yesterday"
            ? Date.parse(today) - Date.parse(day(c.first_discovered_at)) ===
              86400000
            : filter === "This week"
              ? since(c.first_discovered_at, 7)
              : filter === "Unreviewed"
                ? !c.reviewed
                : filter === "High priority"
                  ? c.lead_score >= 85
                  : filter === "Needs verification"
                    ? c.data.verification_status !== "verified"
                    : filter === "Assigned to me"
                      ? !!db.user.employee_id &&
                        c.assigned_employee_id === db.user.employee_id
                      : true),
    )
    .sort((a, b) =>
      sort === "Score"
        ? b.lead_score - a.lead_score
        : sort === "Case number"
          ? a.data.case_number.localeCompare(b.data.case_number)
          : b.first_discovered_at.localeCompare(a.first_discovered_at),
    );
  const chosen = db.cases.find((c) => c.id === detail),
    person = db.attorneys.find((c) => c.id === detail),
    firm = db.firms.find((c) => c.id === detail),
    run = db.runs.find((c) => c.id === detail);
  const people = (id: string) =>
    db.attorneys.filter((p) =>
      db.linked.some((l) => l.attorney_id === p.id && l.case_id === id),
    );
  const active = db.cases.filter((c) => !c.archived),
    latest = db.runs.find((r) => r.status === "completed");
  const controls = (
    <div className="probate-controls">
      <select
        aria-label="Pipeline stage"
        value={stage}
        onChange={(e) => T(e.target.value)}
      >
        {stages.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <button
        onClick={() =>
          act("stage", { value: stage, attorney_id: recipient || undefined })
        }
      >
        Set stage
      </button>
      <button onClick={() => act("approve")}>Approve</button>
      <button onClick={() => act("reject")}>Reject</button>
      <button onClick={() => act("archive")}>Archive</button>
      {admin && (
        <>
          <select
            aria-label="Employee"
            value={employee}
            onChange={(e) => E(e.target.value)}
          >
            <option value="">Unassigned</option>
            {db.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button onClick={() => act("assign", { value: employee || null })}>
            Assign
          </button>
        </>
      )}
      <input
        aria-label="Note or research request"
        placeholder="Note or research request"
        value={note}
        onChange={(e) => N(e.target.value)}
      />
      <button disabled={!note} onClick={() => act("note", { value: note })}>
        Add note
      </button>
      <button disabled={!note} onClick={() => act("research", { value: note })}>
        Request research
      </button>
      <input
        type="date"
        aria-label="Follow-up date"
        value={due}
        onChange={(e) => U(e.target.value)}
      />
      <button
        disabled={!note || !due}
        onClick={() => act("follow-up", { value: note, due })}
      >
        Schedule follow-up
      </button>
      {chosen && (
        <>
          <button onClick={() => act("convert")}>Convert to client</button>
          {admin && (
            <>
              <select
                aria-label="Keep case"
                value={mergeTarget}
                onChange={(e) => Merge(e.target.value)}
              >
                <option value="">Keep case…</option>
                {active
                  .filter((c) => c.id !== chosen.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.data.case_number}
                    </option>
                  ))}
              </select>
              <button
                disabled={!mergeTarget}
                onClick={() => {
                  if (
                    confirm(
                      "Move history and sources to the selected case and archive this duplicate?",
                    )
                  )
                    void act("merge", { value: mergeTarget });
                }}
              >
                Merge duplicate
              </button>
              {chosen.archived && (
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Permanently delete this archived case and its probate history?",
                      )
                    )
                      void act("delete-archived").then(() => V(""));
                  }}
                >
                  Delete archived case
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
  const rangeCases = db.cases.filter(
    (c) =>
      !c.archived && (range === "all" || since(c.first_discovered_at, +range)),
  );

  const stats = {
    "Active managed properties": db.active_properties,
    "New today": active.filter((c) => day(c.first_discovered_at) === today)
      .length,
    "New in 7 days": active.filter((c) => since(c.first_discovered_at, 7))
      .length,
    "New this month": active.filter(
      (c) => day(c.first_discovered_at).slice(0, 7) === today.slice(0, 7),
    ).length,
    "Verified opportunities": rangeCases.filter(
      (c) => c.data.verification_status === "verified",
    ).length,
    "New professional contacts": db.attorneys.filter(
      (a) => range === "all" || since(a.created_at, +range),
    ).length,
    "Pending outreach": rangeCases.filter(
      (c) => c.stage === "Ready for outreach",
    ).length,
    "Follow-ups due": db.tasks.filter((t) => !t.completed && t.due <= today)
      .length,
    "Converted clients": rangeCases.filter((c) => c.client_id).length,
  };
  const table = (rows: Case[]) => {
    const entries = rows.map((c) => {
      const p = people(c.id)[0];
      return {
        c,
        values: [
          day(c.first_discovered_at),
          c.data.filing_date,
          c.data.courthouse || c.data.jurisdiction,
          c.data.property_city,
          c.data.real_estate_status,
          p?.full_name,
          p?.data.law_firm,
          p?.data.business_phone,
          p?.data.professional_email,
          c.lead_score,
          c.data.verification_status,
          c.stage,
          db.employees.find((e) => e.id === c.assigned_employee_id)?.name,
          day(c.updated_at),
        ],
      };
    });
    const columns = [
      "Discovered",
      "Filed",
      "Court",
      "Property city",
      "Real estate",
      "Attorney",
      "Firm",
      "Business phone",
      "Professional email",
      "Score",
      "Verification",
      "Outreach",
      "Assigned",
      "Updated",
    ]
      .map((label, index) => ({ label, index }))
      .filter(({ index }) =>
        entries.some(
          ({ values }) => values[index] != null && values[index] !== "",
        ),
      );
    return (
      <div className="probate-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Select",
                "Case number",
                ...columns.map(({ label }) => label),
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(({ c, values }) => {
              return (
                <tr key={c.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"Select " + c.data.case_number}
                      checked={selected.includes(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                  </td>
                  <td>
                    <button onClick={() => V(c.id)}>
                      {c.data.case_number}
                    </button>{" "}
                    {!c.reviewed && <small>New</small>}
                  </td>
                  {columns.map(({ index, label }) => (
                    <td key={label}>{values[index] ?? "—"}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p>No matching probate cases.</p>}
      </div>
    );
  };
  return (
    <section className="panel probate">
      <div className="probate-controls">
        <label>
          Dataset{" "}
          <select
            value={String(demo)}
            onChange={(e) => {
              Demo(e.target.value === "true");
              V("");
              I([]);
              D(null);
            }}
          >
            <option value="false">Live workspace</option>
            <option value="true">Fictional demonstration</option>
          </select>
        </label>
        <span>{active.filter((c) => !c.reviewed).length} unreviewed</span>
        <button onClick={() => refresh().catch(() => M("Refresh failed."))}>
          Refresh
        </button>
      </div>
      <p role="status">{message}</p>
      {detail ? (
        <>
          <button onClick={() => V("")}>Back to list</button>
          {chosen ? (
            <>
              <h2>{chosen.data.case_number}</h2>
              <Facts
                data={{
                  ...chosen.data,
                  first_discovered: when(chosen.first_discovered_at),
                  last_verified: when(chosen.last_verified_at),
                  stage: chosen.stage,
                  lead_score: chosen.lead_score,
                  priority:
                    chosen.lead_score >= 85
                      ? "High priority"
                      : chosen.lead_score >= 65
                        ? "Qualified"
                        : chosen.lead_score >= 40
                          ? "Needs research"
                          : "Low priority",
                }}
              />
              <h3>Score breakdown</h3>
              <Facts data={chosen.score_breakdown} />
              {people(chosen.id).map((p) => (
                <button key={p.id} onClick={() => V(p.id)}>
                  {p.full_name}
                </button>
              ))}
              <button onClick={() => act("review")}>Mark reviewed</button>
              {people(chosen.id).length > 1 && (
                <select
                  aria-label="Attorney contacted"
                  value={recipient}
                  onChange={(e) => Recipient(e.target.value)}
                >
                  <option value="">Choose attorney</option>
                  {people(chosen.id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              )}
              {controls}
              <h3>Follow-ups</h3>
              {db.tasks
                .filter((t) => t.case_id === detail)
                .map((t) => (
                  <p key={t.id}>
                    {t.due} · {t.title}{" "}
                    {t.completed ? (
                      "Completed"
                    ) : (
                      <button
                        onClick={() => act("task-complete", { value: t.id })}
                      >
                        Complete
                      </button>
                    )}
                  </p>
                ))}
            </>
          ) : person ? (
            <>
              <h2>{person.full_name}</h2>
              <Facts
                data={{
                  ...person.data,
                  ...person.staff,
                  date_discovered: when(person.created_at),
                  associated_cases: db.linked.filter(
                    (l) => l.attorney_id === person.id,
                  ).length,
                  referrals: db.activity.filter(
                    (a) =>
                      a.attorney_id === person.id && a.action === "referral",
                  ).length,
                }}
              />
              <select value={relation} onChange={(e) => H(e.target.value)}>
                {relationships.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button
                onClick={() =>
                  act("attorney", {
                    id: person.id,
                    value: {
                      relationship_status: relation,
                      do_not_contact: relation === "Do not contact",
                    },
                  })
                }
              >
                Save relationship
              </button>
              <input
                aria-label="Professional notes"
                placeholder="Relationship notes"
                value={note}
                onChange={(e) => N(e.target.value)}
              />
              <input
                type="date"
                aria-label="Professional follow-up"
                value={due}
                onChange={(e) => U(e.target.value)}
              />
              <button
                onClick={() =>
                  act("attorney", {
                    id: person.id,
                    value: {
                      notes: note || undefined,
                      next_follow_up: due || null,
                    },
                  })
                }
              >
                Save follow-up
              </button>
              {admin && (
                <>
                  <select
                    aria-label="Assign professional"
                    value={employee}
                    onChange={(e) => E(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {db.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      act("attorney", {
                        id: person.id,
                        value: { assigned_employee_id: employee || null },
                      })
                    }
                  >
                    Assign contact
                  </button>
                </>
              )}
              <button
                disabled={!note}
                onClick={() => act("referral", { id: person.id, value: note })}
              >
                Log referral
              </button>
              <button
                disabled={!note}
                onClick={() =>
                  act("communication", { id: person.id, value: note })
                }
              >
                Log communication
              </button>
              <h3>Associated cases</h3>
              {table(
                active.filter((c) =>
                  people(c.id).some((a) => a.id === person.id),
                ),
              )}
            </>
          ) : firm ? (
            <>
              <h2>{firm.firm_name}</h2>
              <Facts data={firm.data} />
              {db.attorneys
                .filter((p) => p.law_firm_id === firm.id)
                .map((p) => (
                  <button key={p.id} onClick={() => V(p.id)}>
                    {p.full_name}
                  </button>
                ))}
              {table(
                active.filter((c) =>
                  people(c.id).some((p) => p.law_firm_id === firm.id),
                ),
              )}
            </>
          ) : run ? (
            <>
              <h2>{run.external_run_id}</h2>
              <Facts
                data={{
                  status: run.status,
                  started: when(run.started_at),
                  completed: when(run.completed_at),
                  ...run.data,
                }}
              />
            </>
          ) : null}
          {db.sources
            .filter((s) => s.case_id === detail || s.attorney_id === detail)
            .map((s) => (
              <p key={s.source_url}>
                <a href={s.source_url} target="_blank" rel="noreferrer">
                  {s.data.source_name}
                </a>{" "}
                · Retrieved {when(s.date_retrieved)}
              </p>
            ))}
          {db.activity
            .filter(
              (a) =>
                a.case_id === detail ||
                a.attorney_id === detail ||
                (firm &&
                  db.attorneys.some(
                    (p) => p.law_firm_id === firm.id && p.id === a.attorney_id,
                  )),
            )
            .map((a) => (
              <p key={a.id}>
                {when(a.created_at)} · {a.actor} · {a.action} {a.detail}
              </p>
            ))}
        </>
      ) : page === "Overview" ? (
        <>
          <h2>Probate opportunities</h2>
          <select
            aria-label="Statistics range"
            value={range}
            onChange={(e) => R(e.target.value)}
          >
            {[
              ["1", "Today"],
              ["7", "Last 7 days"],
              ["30", "Last 30 days"],
              ["90", "Last 90 days"],
              ["all", "All time"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <Facts data={stats} />
          <p>
            Last successful Hermes run ·{" "}
            {latest ? when(latest.completed_at) : "No completed runs"}
          </p>
          <h3>Today’s qualified opportunities</h3>
          {table(
            active.filter(
              (c) => day(c.first_discovered_at) === today && c.lead_score >= 65,
            ),
          )}
          <div className="probate-charts">
            {Object.entries({
              "Daily lead volume": rangeCases.map((c) =>
                day(c.first_discovered_at),
              ),
              "Weekly volume": rangeCases.map((c) => {
                const d = new Date(day(c.first_discovered_at) + "T12:00Z");
                d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
                return d.toISOString().slice(0, 10);
              }),
              "Property city": rangeCases.map(
                (c) => c.data.property_city || "Unknown",
              ),
              "Discovery source": db.sources
                .filter((s) => rangeCases.some((c) => c.id === s.case_id))
                .map((s) => s.data.source_name),
              Conversion: rangeCases.map((c) =>
                c.client_id ? "Converted" : "Open",
              ),
              "Outreach stage": rangeCases.map((c) => c.stage),
            }).map(([k, values]) => (
              <div key={k}>
                <h3>{k}</h3>
                {group(values).map(([label, count]) => (
                  <p key={label}>
                    {label}{" "}
                    <meter
                      min={0}
                      max={Math.max(1, values.length)}
                      value={count}
                    />{" "}
                    {count}
                    {k === "Conversion"
                      ? " (" + Math.round((100 * count) / values.length) + "%)"
                      : ""}
                  </p>
                ))}
                {!values.length && <small>No records in range</small>}
              </div>
            ))}
          </div>
        </>
      ) : page === "Settings" ? (
        admin ? (
          <>
            <h2>Integration settings</h2>
            <label>
              Setting{" "}
              <select
                value={setting}
                onChange={(e) => {
                  K(e.target.value);
                  A("");
                }}
              >
                {["territory", "expansion", "sources", "weights"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <p>{JSON.stringify(db.config[setting as keyof Data["config"]])}</p>
            <textarea
              aria-label="Setting value"
              placeholder={
                setting === "weights"
                  ? "Enter weights as JSON"
                  : "One entry per line"
              }
              value={edit}
              onChange={(e) => A(e.target.value)}
            />
            <button
              onClick={() => {
                try {
                  void act("settings", {
                    key: setting,
                    value:
                      setting === "weights"
                        ? JSON.parse(edit)
                        : edit
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                  });
                } catch {
                  M("Enter valid JSON weights.");
                }
              }}
            >
              Save setting
            </button>
            <button
              onClick={() =>
                act("settings", { key: "enabled", value: !db.config.enabled })
              }
            >
              {db.config.enabled ? "Pause" : "Enable"} ingestion
            </button>
            <h3>Employee access</h3>
            <input
              type="email"
              aria-label="Employee email"
              value={note}
              onChange={(e) => N(e.target.value)}
            />
            <select value={role} onChange={(e) => G(e.target.value)}>
              <option>employee</option>
              <option>administrator</option>
            </select>
            <button
              onClick={() =>
                act("access", { email: note, role, enabled: true })
              }
            >
              Authorize account
            </button>
            {db.access.map((a) => (
              <p key={a.email}>
                {a.email} · {a.role} · {a.enabled ? "Enabled" : "Disabled"}{" "}
                <button
                  disabled={a.email === db.user.email}
                  onClick={() => act("access", { ...a, enabled: !a.enabled })}
                >
                  {a.enabled ? "Disable" : "Enable"}
                </button>
              </p>
            ))}
            <h3>Demonstration records</h3>
            <button onClick={() => act("demo-seed")}>
              Load fictional examples
            </button>
            <button
              onClick={() => {
                if (confirm("Remove the fictional probate dataset?"))
                  void act("demo-remove");
              }}
            >
              Remove fictional examples
            </button>
          </>
        ) : (
          <p>Integration settings require administrator access.</p>
        )
      ) : (
        <>
          <input
            aria-label="Search probate records"
            placeholder="Search records"
            value={search}
            onChange={(e) => S(e.target.value)}
          />
          {page === "Hermes Activity" ? (
            <>
              <h2>Hermes activity</h2>
              <p>
                Expected daily at 6:00 AM Pacific ·{" "}
                {db.runs[0]?.status || "No recent activity"}
              </p>
              <p>
                Last successful run ·{" "}
                {latest ? when(latest.completed_at) : "None"}
              </p>
              {admin && (
                <>
                  <button onClick={() => act("test")}>Test connection</button>
                  <button onClick={() => act("run")}>
                    Request research run
                  </button>
                </>
              )}
              {db.runs
                .filter((r) => r.external_run_id.includes(search))
                .map((r) => (
                  <button className="line" key={r.id} onClick={() => V(r.id)}>
                    {r.external_run_id} · {r.status} · {when(r.started_at)}
                  </button>
                ))}
            </>
          ) : page === "Attorneys & Law Firms" ? (
            <>
              <h2>Professional contacts</h2>
              {db.attorneys
                .filter((p) =>
                  JSON.stringify(p.data)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((p) => (
                  <button className="line" key={p.id} onClick={() => V(p.id)}>
                    {p.full_name} · {p.data.law_firm || "Independent"} ·{" "}
                    {p.staff.relationship_status || "New contact"}
                  </button>
                ))}
              <h3>Law firms</h3>
              {db.firms
                .filter((f) =>
                  f.firm_name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((f) => (
                  <button key={f.id} onClick={() => V(f.id)}>
                    {f.firm_name}
                  </button>
                ))}
            </>
          ) : (
            <>
              <div className="probate-controls">
                <select
                  aria-label="Inbox filter"
                  value={filter}
                  onChange={(e) => F(e.target.value)}
                >
                  {inbox.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Sort by"
                  value={sort}
                  onChange={(e) => O(e.target.value)}
                >
                  {["Discovered", "Score", "Case number"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button onClick={() => B(!view)}>
                  {view ? "List view" : "Pipeline board"}
                </button>
              </div>
              {selected.length > 0 && controls}
              {view ? (
                <div className="probate-board">
                  {stages.map((s) => (
                    <section
                      key={s}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        void act("stage", {
                          ids: [e.dataTransfer.getData("text/plain")],
                          value: s,
                        });
                      }}
                    >
                      <h3>{s}</h3>
                      {filtered
                        .filter((c) => c.stage === s)
                        .map((c) => (
                          <button
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData("text/plain", c.id)
                            }
                            key={c.id}
                            onClick={() => V(c.id)}
                          >
                            {c.data.case_number} · {c.lead_score}
                          </button>
                        ))}
                    </section>
                  ))}
                </div>
              ) : (
                table(filtered)
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
