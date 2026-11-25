"use client";
import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard,
  ContactRound,
  Columns3,
  BookUser,
  UsersRound,
  House,
  ListChecks,
  CalendarDays,
  Activity,
  Files,
  ChartNoAxesColumnIncreasing,
  Settings2,
  Search,
  Plus,
  PanelLeft,
  ChevronRight,
  Menu,
  X,
  Sun,
  Moon,
  ChevronDown,
  Calendar as CalendarIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dashboard } from "./Dashboard";
import { Directory } from "./Directory";
import { Editor, type Draft } from "./Editor";
import { Pipeline, Calendar, Timeline } from "./Operations";
import { Profile } from "./Profile";
import { Button } from "./ui/button";
import Intelligence from "./Intelligence";
import Reports from "./Reports";
import { Modal } from "./ui/dialog";
import {
  label,
  plural,
  choices,
  type Snapshot,
  type Row,
  type Kind,
} from "../lib/model";
import { searchable } from "../lib/view";
const sectionTitle = (name: string) =>
  name === "Attorneys & Law Firms" ? "Attorneys" :
  name === "Probate Intelligence" ? "Probate Leads" : name;
const nav: [string, LucideIcon][] = [
  ["Overview", LayoutDashboard],
  ["Probate Intelligence", BookUser],
  ["New Leads", ContactRound],
  ["Attorneys & Law Firms", UsersRound],
  ["Hermes Activity", Activity],
  ["Leads", ContactRound],
  ["Sales Pipeline", Columns3],
  ["Contacts", BookUser],
  ["Customers", UsersRound],
  ["Properties", House],
  ["Tasks", ListChecks],
  ["Calendar", CalendarDays],
  ["Activity", Activity],
  ["Documents", Files],
  ["Reports", ChartNoAxesColumnIncreasing],
  ["Settings", Settings2],
];
const subtitles: Record<string, string> = {
  Overview: "Your properties, relationships, and priorities in one place.",
  Leads: "Manage inquiries and plan the next conversation.",
  "Sales Pipeline": "Track opportunities from first inquiry through close.",
  Contacts: "The people connected to your estates and accounts.",
  Customers: "Households and clients under your care.",
  Properties: "Service details and schedules for each property.",
  Tasks: "Coordinate assignments and follow-ups.",
  Calendar: "Appointments, visits, and team deadlines.",
  Activity: "A chronological record of team interactions.",
  Documents: "Private files associated with your records.",
  Reports: "Performance across relationships and operations.",
  Settings: "Manage your workspace and team preferences.",
};
const kindOf = (p: string) =>
  Object.keys(plural).find((k) => plural[k as Kind] === p) as Kind | undefined;
async function api(body: unknown) {
  const res = await fetch("/api/crm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error);
  return data.result;
}
export default function Workspace() {
  const [db, setDB] = useState<Snapshot | null>(null),
    [page, setPage] = useState("Overview"),
    [filter, setFilter] = useState("All"),
    [draft, edit] = useState<Draft | null>(null),
    [id, profile] = useState(""),
    [search, searchBox] = useState(false),
    [q, query] = useState(""),
    [quick, menu] = useState(false),
    [compact, collapse] = useState(false),
    [mobile, drawer] = useState(false),
    [toast, notice] = useState(""),
    [issue, fail] = useState(""),
    [upload, uploadTo] = useState<string | null>(null),
    [pref, setting] = useState(""),
    [activeEmp, chooseEmp] = useState("");
  const [dark, theme] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/crm", { cache: "no-store" });
    if (res.status === 401) {
      location.assign("/login");
      throw Error("Employee sign-in required.");
    }
    const data = await res.json();
    if (!res.ok) throw Error(data.error);
    setDB(data);
    fail("");
    return data as Snapshot;
  }, []);
  useEffect(() => {
    refresh()
      .then((d) => theme(d.settings.appearance[0] === "Dark"))
      .catch((e) => fail(e.message));
    const route = () => {
      const s = new URLSearchParams(location.hash.slice(1));
      const v = s.get("page");
      setPage(nav.some(([n]) => n === v) ? v! : "Overview");
      setFilter(s.get("filter") || "All");
      profile(s.get("record") || "");
    };
    route();
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchBox((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("hashchange", route);
      window.removeEventListener("popstate", route);
      window.removeEventListener("keydown", key);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => notice(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  function go(p: string, f = "All") {
    history.pushState(
      null,
      "",
      "#" + new URLSearchParams({ page: p, filter: f }).toString(),
    );
    setPage(p);
    setFilter(f);
    profile("");
    menu(false);
    drawer(false);
  }
  function open(r: Row) {
    profile(r.id);
    searchBox(false);
    history.pushState(
      null,
      "",
      "#" + new URLSearchParams({ page, filter, record: r.id }).toString(),
    );
  }
  function closeProfile() {
    profile("");
    history.replaceState(null, "", "#" + new URLSearchParams({ page, filter }));
  }
  function start(r: Draft) {
    menu(false);
    closeProfile();
    edit({ ...r, employee_id: r.employee_id || activeEmp || null });
  }
  async function save(rows: Draft[]) {
    await api({ action: "save", rows });
    await refresh();
    notice(
      rows.length === 1 ? "Record saved." : rows.length + " records saved.",
    );
  }
  async function conversion(r: Row) {
    try {
      const customer = await api({ action: "convert", id: r.id });
      await refresh();
      go("Customers");
      profile(customer);
      history.pushState(
        null,
        "",
        "#" +
          new URLSearchParams({
            page: "Customers",
            record: customer,
          }).toString(),
      );
      notice("Customer profile ready.");
    } catch (e) {
      notice((e as Error).message);
    }
  }
  async function update(r: Row, s: string) {
    try {
      await save([{ ...r, data: { ...r.data, status: s } }]);
      if (
        r.kind === "lead" &&
        s === "Won" &&
        confirm("Convert this won lead to an active customer?")
      )
        await conversion(r);
    } catch (e) {
      notice((e as Error).message);
    }
  }
  async function config(key: string, values: string[]) {
    await api({ action: "settings", key, values });
    await refresh();
    if (key === "appearance") theme(values[0] === "Dark");
    notice("Preference saved.");
  }
  const current = db?.rows.find((x) => x.id === id),
    kind = kindOf(page);
  const emp =
    db?.rows.filter((x) => x.kind === "employee" && !x.archived) || [];
  const results = (db?.rows || []).filter(
    (x) =>
      !x.archived &&
      ["lead", "customer", "property", "contact", "task", "note"].includes(
        x.kind,
      ) &&
      searchable(x).includes(q.toLowerCase()),
  );
  return (
    <div
      className={"shell " + (compact ? "compact " : "") + (dark ? "dark" : "")}
    >
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => drawer(false)}
        />
      )}
      <aside className={mobile ? "mobile-open" : ""}>
        <div className="brand">
          {db?.settings.logo?.[0] && db.settings.logo[0] !== "Keystone mark" ? (
            <span
              role="img"
              aria-label="Company logo"
              className="company-logo"
              style={{
                backgroundImage:
                  "url(/api/files?id=" +
                  encodeURIComponent(db.settings.logo[0]) +
                  ")",
              }}
            />
          ) : (
            <div
              className="official-logo"
              role="img"
              aria-label="Keystone Estate Care"
            />
          )}
          {db?.settings.company?.[0] &&
            db.settings.company[0] !== "Keystone Estate Care" && (
              <span>{db.settings.company[0]}</span>
            )}
        </div>
        <div className="navcaption">Workspace</div>
        <nav>
          {nav.map(([name, Icon], i) => (
            <div key={name}>
              {i === 6 && <div className="navcaption">Operations</div>}
              {i === 10 && <div className="navcaption">Administration</div>}
              <button
                title={sectionTitle(name)}
                aria-current={page === name ? "page" : undefined}
                className={page === name ? "selected" : ""}
                onClick={() => go(name)}
              >
                <Icon size={17} />
                <span>
                  {(
                    {
                      Overview: "Dashboard",
                      Customers: "Clients",
                      Tasks: "Tasks & Follow-Ups",
                      Activity: "Activity History",
                      Leads: "Sales leads",
                    } as Record<string, string>
                  )[name] || sectionTitle(name)}
                </span>
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebarfoot">
          <span className="demodot" />
          <button
            onClick={async () => {
              await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "logout" }),
              });
              location.assign("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main>
        <header className="top">
          <button
            className="desk flat"
            aria-label="Collapse navigation"
            onClick={() => collapse(!compact)}
          >
            <PanelLeft size={17} />
          </button>
          <button
            className="mobile flat"
            aria-label="Open navigation"
            onClick={() => drawer(true)}
          >
            <Menu size={19} />
          </button>
          <span className="crumb">
            Workspace <ChevronRight size={13} /> <b>{sectionTitle(page)}</b>
          </span>
          <button
            className="globalsearch"
            onClick={() => {
              query("");
              searchBox(true);
            }}
          >
            <Search size={16} />
            <span>Search workspace</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="flat"
            aria-label="Toggle appearance"
            onClick={() => {
              theme(!dark);
              void config("appearance", [dark ? "Light" : "Dark"]).catch((e) =>
                notice(e.message),
              );
            }}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div className="quick">
            <button
              className="primary"
              aria-expanded={quick}
              onClick={() => menu(!quick)}
            >
              <Plus size={16} /> Quick add <ChevronDown size={14} />
            </button>
            {quick && (
              <div className="popover">
                {(
                  [
                    "lead",
                    "customer",
                    "contact",
                    "property",
                    "task",
                    "note",
                  ] as Kind[]
                ).map((k) => (
                  <button key={k} onClick={() => start({ kind: k })}>
                    New {k}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
        <div className="content">
          <div className="pagehead">
            <div>
              <h1>{page === "Overview" ? "Workspace overview" : sectionTitle(page)}</h1>
              <p>{subtitles[page]}</p>
            </div>
            {page === "Overview" ? (
              <div className="datestamp">
                <CalendarIcon size={15} />
                {db &&
                  new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
              </div>
            ) : page === "Documents" ? (
              <button className="primary" onClick={() => uploadTo("")}>
                <Plus size={15} />
                Upload file
              </button>
            ) : (kind && !["activity", "document"].includes(kind)) ||
              page === "Sales Pipeline" ? (
              <button
                className="primary"
                onClick={() => start({ kind: kind || "lead" })}
              >
                <Plus size={15} />
                New {kind || "lead"}
              </button>
            ) : null}
          </div>
          {db && ["Settings", "Overview"].includes(page) && (
            <Intelligence key={page} page={page} />
          )}
          {issue ? (
            <section className="panel empty">
              <p role="alert">{issue}</p>
              <button onClick={() => refresh().catch((e) => fail(e.message))}>
                Retry connection
              </button>
            </section>
          ) : !db ? (
            <div role="status" className="skeleton">
              Loading workspace…
            </div>
          ) : page === "Overview" ? (
            <Dashboard
              db={db}
              go={go}
              open={open}
              complete={(r) => void update(r, "Completed")}
            />
          ) : [
              "Probate Intelligence",
              "New Leads",
              "Attorneys & Law Firms",
              "Hermes Activity",
            ].includes(page) ? (
            <Intelligence key={page} page={page} />
          ) : page === "Sales Pipeline" ? (
            <Pipeline db={db} open={open} move={update} />
          ) : page === "Calendar" ? (
            <Calendar
              db={db}
              open={open}
              add={(date) =>
                start({ kind: "appointment", data: { due: date } })
              }
            />
          ) : page === "Activity" ? (
            <section className="panel">
              <Timeline
                rows={db.rows.filter(
                  (r) =>
                    ["activity", "communication", "note"].includes(r.kind) &&
                    !r.archived,
                )}
                open={open}
              />
            </section>
          ) : page === "Reports" ? (
            <Reports db={db} />
          ) : page === "Settings" ? (
            <div className="dashboardgrid">
              <section className="panel">
                <div className="panelhead">
                  <h2>Workspace preferences</h2>
                </div>
                {Object.entries(db.settings).map(([k, v]) => (
                  <button className="line" key={k} onClick={() => setting(k)}>
                    <span>
                      <b>{label(k.replace(/([A-Z])/g, " $1").toLowerCase())}</b>
                      <small>{v.join(", ")}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </section>
              <section className="panel fit">
                <div className="panelhead">
                  <h2>Employee directory</h2>
                  <button onClick={() => start({ kind: "employee" })}>
                    Add employee
                  </button>
                </div>
                <Timeline rows={emp} open={open} />
                <div className="tools">
                  <label>
                    Default assignment for this session
                    <select
                      value={activeEmp}
                      onChange={(e) => chooseEmp(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {emp.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="textlink" onClick={() => go("Leads")}>
                  Import or export lead data <ChevronRight size={14} />
                </button>
              </section>
            </div>
          ) : kind ? (
            <Directory
              key={page + filter}
              kind={kind}
              db={db}
              initial={filter}
              open={open}
              update={update}
              save={save}
              notice={notice}
            />
          ) : null}
        </div>
      </main>
      {db && draft && (
        <Editor
          draft={draft}
          db={db}
          close={() => edit(null)}
          submit={async (r) => {
            await save([r]);
            if (
              r.kind === "lead" &&
              r.id &&
              r.data?.status === "Won" &&
              confirm("Convert this lead to a customer?")
            )
              await conversion(r as Row);
          }}
        />
      )}
      {db && current && !draft && upload === null && (
        <Profile
          key={current.id}
          r={current}
          db={db}
          open={open}
          edit={start}
          close={closeProfile}
          convert={conversion}
          done={(r) => void update(r, "Completed")}
          upload={uploadTo}
        />
      )}
      {search && (
        <Modal title="Search workspace" close={() => searchBox(false)}>
          <div className="tools">
            <Search size={17} />
            <input
              autoFocus
              placeholder="Name, email, phone, address or tag"
              value={q}
              onChange={(e) => query(e.target.value)}
            />
          </div>
          {q ? (
            (
              [
                "lead",
                "customer",
                "contact",
                "property",
                "task",
                "note",
              ] as Kind[]
            ).map((k) => {
              const found = results.filter((r) => r.kind === k);
              return found.length ? (
                <div key={k}>
                  <h3 className="groupname">{plural[k]}</h3>
                  {found.slice(0, 12).map((r) => (
                    <button key={r.id} className="line" onClick={() => open(r)}>
                      {r.name}
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              ) : null;
            })
          ) : (
            <p className="empty">Type to find a record.</p>
          )}
          {q && !results.length && <p className="empty">No matches.</p>}
        </Modal>
      )}
      {db && pref && (
        <Modal title={"Edit " + label(pref)} close={() => setting("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("values"));
              try {
                await config(
                  pref,
                  value
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                );
                setting("");
              } catch (e) {
                notice((e as Error).message);
              }
            }}
          >
            <div className="tools">
              <label>
                {pref === "logo"
                  ? "Logo from uploaded images"
                  : pref === "appearance"
                    ? "Appearance"
                    : pref === "notifications"
                      ? "Dashboard reminders"
                      : "Values, one per line"}
                {pref === "logo" ? (
                  <select name="values" defaultValue={db.settings.logo[0]}>
                    <option>Keystone mark</option>
                    {db.rows
                      .filter(
                        (r) =>
                          r.kind === "document" &&
                          !r.archived &&
                          r.data.mime?.startsWith("image/"),
                      )
                      .map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                ) : pref === "notifications" ? (
                  <select
                    name="values"
                    defaultValue={db.settings.notifications[0]}
                  >
                    <option>Show overdue reminders</option>
                    <option>Hide overdue reminders</option>
                  </select>
                ) : pref === "appearance" ? (
                  <select name="values" defaultValue={db.settings[pref][0]}>
                    <option>Light</option>
                    <option>Dark</option>
                  </select>
                ) : (
                  <textarea
                    rows={7}
                    name="values"
                    required
                    defaultValue={db.settings[pref].join("\n")}
                  />
                )}
              </label>
            </div>
            <footer>
              <Button className="primary">Save preference</Button>
            </footer>
          </form>
        </Modal>
      )}
      {db && upload !== null && (
        <Modal title="Upload document" close={() => uploadTo(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const btn = form.querySelector(
                "button[type=submit]",
              ) as HTMLButtonElement;
              btn.disabled = true;
              try {
                const res = await fetch("/api/files", {
                  method: "POST",
                  body: new FormData(form),
                });
                if (!res.ok) throw Error((await res.json()).error);
                await refresh();
                uploadTo(null);
                notice("Document uploaded.");
              } catch (e) {
                notice((e as Error).message);
              } finally {
                btn.disabled = false;
              }
            }}
          >
            <div className="formgrid">
              <label className="wide">
                Fictional document · 4 MB maximum
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.jpg,.jpeg,.png,.txt"
                  required
                />
              </label>
              <label>
                Category
                <select name="category">
                  {choices("document", "category", db.settings)?.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Associated record
                <select name="parent_id" defaultValue={upload}>
                  <option value="">None</option>
                  {db.rows
                    .filter(
                      (r) =>
                        ["lead", "customer", "property"].includes(r.kind) &&
                        !r.archived,
                    )
                    .map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="wide">
                Description
                <textarea name="description" />
              </label>
            </div>
            <footer>
              <button type="submit" className="primary">
                Upload
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss" onClick={() => notice("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
