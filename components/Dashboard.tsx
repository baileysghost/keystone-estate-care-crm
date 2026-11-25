import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  UsersRound,
  House,
  ChartNoAxesColumnIncreasing,
  ContactRound,
  Clock3,
  ChevronRight,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { today, money, type Row, type Snapshot } from "../lib/model";
import { matches, openLead } from "../lib/view";
export function growth(rows: Row[], count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - count + i + 1);
    const key = today(d).slice(0, 7);
    return {
      name: d.toLocaleDateString("en-US", { month: "short" }),
      customers: rows.filter(
        (r) =>
          r.kind === "customer" &&
          (r.data.customer_since || r.created_at).slice(0, 7) <= key,
      ).length,
      leads: rows.filter(
        (r) => r.kind === "lead" && r.created_at.slice(0, 7) === key,
      ).length,
    };
  });
}
type Props = {
  db: Snapshot;
  go: (v: string, f?: string) => void;
  open: (r: Row) => void;
  complete: (r: Row) => void;
};
export function Dashboard({ db, go, open, complete }: Props) {
  const [span, setSpan] = useState(6);
  const rows = db.rows.filter((r) => !r.archived),
    leads = rows.filter((r) => r.kind === "lead"),
    customers = rows.filter((r) => r.kind === "customer"),
    pipeline = leads.filter(openLead),
    tasks = rows.filter((r) => r.kind === "task"),
    appointments = rows
      .filter((r) => r.kind === "appointment" && matches(r, "Upcoming"))
      .sort((a, b) =>
        (a.data.due + a.data.time).localeCompare(b.data.due + b.data.time),
      );
  const sums = pipeline.reduce((s, r) => s + Number(r.data.value || 0), 0);
  const cards = [
    {
      name: "Active customers",
      val: customers.filter((r) => r.data.status === "Active").length,
      icon: UsersRound,
      page: "Customers",
      filter: "Active",
      foot: "Customer directory",
    },
    {
      name: "Properties in care",
      val: rows.filter(
        (r) => r.kind === "property" && r.data.status === "Active",
      ).length,
      icon: House,
      page: "Properties",
      filter: "Active",
      foot: "Property portfolio",
    },
    {
      name: "Total leads",
      val: leads.length,
      icon: ContactRound,
      page: "Leads",
      filter: "All",
      foot:
        leads.filter((r) => matches(r, "This month")).length +
        " new this month",
    },
    {
      name: "Pipeline value",
      val: money(sums),
      icon: ChartNoAxesColumnIncreasing,
      page: "Leads",
      filter: "Open pipeline",
      foot: pipeline.length + " open opportunities",
    },
  ];
  const groups = [...new Set(leads.map((r) => r.data.source || "Other"))]
    .map((s) => ({
      name: s,
      count: leads.filter((r) => (r.data.source || "Other") === s).length,
    }))
    .sort((a, b) => b.count - a.count);
  return (
    <>
      <div className="metrics">
        {cards.map(({ name, val, icon: Icon, page, filter, foot }) => (
          <button
            className="metric"
            key={name}
            onClick={() => go(page, filter)}
          >
            <span className="metriclabel">
              <Icon size={17} />
              {name}
            </span>
            <strong>{val}</strong>
            <span className="metricfoot">
              {foot}
              <ArrowUpRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <div className="dashboardgrid">
        <section className="panel">
          <div className="panelhead">
            <div>
              <h2>Relationship growth</h2>
              <small>New leads and total customers</small>
            </div>
            <select
              aria-label="Chart period"
              value={span}
              onChange={(e) => setSpan(+e.target.value)}
            >
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>
          <div className="legend">
            <i />
            Customers <i />
            New leads
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={growth(rows, span)}
                margin={{ left: -24, right: 16, top: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 5"
                  vertical={false}
                  stroke="#dddcd4"
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#777b75" }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#777b75" }}
                />
                <Tooltip />
                <Area
                  name="Customers"
                  type="monotone"
                  dataKey="customers"
                  stroke="#356744"
                  fill="#60866b"
                  fillOpacity={0.12}
                  strokeWidth={2.5}
                />
                <Area
                  name="New leads"
                  type="monotone"
                  dataKey="leads"
                  stroke="#b99a60"
                  fill="#b99a60"
                  fillOpacity={0.09}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panelhead">
            <div>
              <h2>Upcoming appointments</h2>
              <small>Next on the team calendar</small>
            </div>
            <CalendarDays size={19} />
          </div>
          {appointments.slice(0, 3).map((r) => (
            <button className="line" key={r.id} onClick={() => open(r)}>
              <span className="datebox">
                {new Date(r.data.due + "T12:00").toLocaleDateString("en-US", {
                  month: "short",
                })}
                <b>{r.data.due.slice(-2)}</b>
              </span>
              <span>
                <b>{r.name}</b>
                <small>
                  {r.data.time} ·{" "}
                  {db.rows.find((x) => x.id === r.employee_id)?.name || "Team"}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!appointments.length && (
            <p className="empty">No upcoming appointments.</p>
          )}
          <button className="textlink" onClick={() => go("Calendar")}>
            Open calendar <ArrowUpRight size={14} />
          </button>
        </section>
        <section className="panel">
          <div className="panelhead">
            <div>
              <h2>Follow-up desk</h2>
              <small>Priorities for the care team</small>
            </div>
            <Clock3 size={19} />
          </div>
          <div className="quickstats">
            {[
              ["Due today", "Today"],
              ["Overdue tasks", "Overdue"],
              ["Overdue follow-ups", "Overdue follow-ups"],
            ]
              .filter(
                ([, f]) =>
                  db.settings.notifications[0] !== "Hide overdue reminders" ||
                  f === "Today",
              )
              .map(([title, f]) => (
                <button
                  key={f}
                  onClick={() =>
                    go(f === "Overdue follow-ups" ? "Leads" : "Tasks", f)
                  }
                >
                  <b>
                    {
                      (f === "Overdue follow-ups" ? leads : tasks).filter((r) =>
                        matches(r, f),
                      ).length
                    }
                  </b>
                  {title}
                </button>
              ))}
          </div>
          {tasks
            .filter((r) => r.data.status !== "Completed")
            .sort((a, b) => a.data.due.localeCompare(b.data.due))
            .slice(0, 3)
            .map((r) => (
              <div className="line" key={r.id}>
                <button
                  aria-label={"Complete " + r.name}
                  onClick={() => complete(r)}
                >
                  <Check size={14} />
                </button>
                <button className="flat" onClick={() => open(r)}>
                  {r.name}
                </button>
                <small>{r.data.due}</small>
              </div>
            ))}
        </section>
        <section className="panel">
          <div className="panelhead">
            <h2>Lead sources</h2>
            <button onClick={() => go("Reports")} aria-label="View reports">
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="bars">
            {groups.map((g) => (
              <div key={g.name}>
                <span>
                  {g.name}
                  <b>{g.count}</b>
                </span>
                <progress
                  value={g.count}
                  max={Math.max(1, ...groups.map((x) => x.count))}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panelhead">
            <h2>Pipeline distribution</h2>
            <button onClick={() => go("Sales Pipeline")}>View board</button>
          </div>
          <div className="bars">
            {db.settings.stages
              .filter((s) => leads.some((r) => r.data.status === s))
              .map((s) => (
                <button key={s} className="flat" onClick={() => go("Leads", s)}>
                  <span>
                    {s}
                    <b>{leads.filter((r) => r.data.status === s).length}</b>
                  </span>
                  <progress
                    value={leads.filter((r) => r.data.status === s).length}
                    max={leads.length}
                  />
                </button>
              ))}
          </div>
          <div className="quickstats">
            <button onClick={() => go("Leads", "Won")}>
              <b>
                {Math.round(
                  (100 * leads.filter((r) => r.data.status === "Won").length) /
                    (leads.length || 1),
                )}
                %
              </b>
              Lead conversion
            </button>
            <button onClick={() => go("Leads", "Proposal Sent")}>
              <b>
                {leads.filter((r) => r.data.status === "Proposal Sent").length}
              </b>
              Pending proposals
            </button>
            <button onClick={() => go("Leads", "This month")}>
              <b>{leads.filter((r) => matches(r, "This month")).length}</b>New
              this month
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="panelhead">
            <h2>Recent activity</h2>
          </div>
          {rows
            .filter((r) => r.kind === "activity")
            .slice(0, 4)
            .map((r) => (
              <button className="line" key={r.id} onClick={() => open(r)}>
                <span>
                  <b>{r.name}</b>
                  <small>{r.data.description}</small>
                </span>
              </button>
            ))}
          <div className="panelhead">
            <h2>Recently added customers</h2>
          </div>
          {customers.slice(0, 3).map((r) => (
            <button className="line" key={r.id} onClick={() => open(r)}>
              {r.name}
              <ChevronRight size={15} />
            </button>
          ))}
        </section>
      </div>
    </>
  );
}
