import { useState } from "react";
import Papa from "papaparse";
import { Search, Download, Columns3, Upload, ArrowUpDown } from "lucide-react";
import {
  label,
  plural,
  fields,
  type Kind,
  type Row,
  type Snapshot,
  money,
} from "../lib/model";
import { exportCsv, searchable, matches, initials } from "../lib/view";
import type { Draft } from "./Editor";
export function Directory({
  kind,
  db,
  initial,
  open,
  save,
  notice,
  update,
}: {
  kind: Kind;
  db: Snapshot;
  initial: string;
  open: (r: Row) => void;
  save: (r: Draft[]) => Promise<void>;
  notice: (s: string) => void;
  update: (r: Row, status: string) => void;
}) {
  const [query, search] = useState(""),
    [filter, choose] = useState(initial),
    [page, paginate] = useState(0),
    [reverse, sort] = useState(false),
    [selected, select] = useState<string[]>([]),
    [archived, archive] = useState(false),
    [cols, columns] = useState<string[]>(
      kind === "lead"
        ? ["status", "city", "value", "employee"]
        : kind === "task"
          ? ["status", "due", "priority", "employee"]
          : kind === "property"
            ? ["city", "property_type", "status"]
            : kind === "customer"
              ? ["status", "email", "frequency"]
              : kind === "contact"
                ? ["contact_type", "email", "phone"]
                : ["category", "description"],
    );
  const rows = db.rows
    .filter(
      (r) =>
        r.kind === kind &&
        r.archived === archived &&
        matches(r, filter) &&
        searchable(r).includes(query.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name) * (reverse ? -1 : 1));
  const pageNo = Math.min(page, Math.max(0, Math.ceil(rows.length / 10) - 1));
  const shown = rows.slice(pageNo * 10, pageNo * 10 + 10);
  const filters = [
    ...new Set([
      "All",
      initial,
      ...(kind === "task" ? ["Today", "Upcoming", "Overdue", "Completed"] : []),
      ...db.rows
        .filter((x) => x.kind === kind)
        .map((x) => x.data.status)
        .filter(Boolean),
    ]),
  ];
  async function bulk(changes: (r: Row) => Draft) {
    try {
      await save(rows.filter((r) => selected.includes(r.id)).map(changes));
      select([]);
    } catch (e) {
      notice((e as Error).message);
    }
  }
  return (
    <section className="panel directory">
      <div className="tools">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search directory"
            placeholder={"Search " + plural[kind].toLowerCase()}
            value={query}
            onChange={(e) => {
              search(e.target.value);
              paginate(0);
            }}
          />
        </label>
        <select
          aria-label="Filter records"
          value={filter}
          onChange={(e) => {
            choose(e.target.value);
            paginate(0);
            select([]);
          }}
        >
          {filters.map((f) => (
            <option key={f}>{f}</option>
          ))}
          {db.rows
            .filter((r) => r.kind === "employee")
            .map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <details>
          <summary>
            <Columns3 size={15} />
            Columns
          </summary>
          <div className="popover">
            {[...fields[kind], "employee"].map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={cols.includes(c)}
                  onChange={(e) =>
                    columns(
                      e.target.checked
                        ? [...cols, c]
                        : cols.filter((x) => x !== c),
                    )
                  }
                />
                {label(c)}
              </label>
            ))}
          </div>
        </details>
        <button
          title="Export filtered records"
          onClick={() =>
            exportCsv(
              kind,
              Papa.unparse(
                rows.map((r) => ({
                  name: r.name,
                  ...r.data,
                  tags: r.tags.join(", "),
                })),
                { escapeFormulae: true },
              ),
            )
          }
        >
          <Download size={15} /> Export
        </button>
        {kind === "lead" && (
          <label className="button">
            <Upload size={15} />
            Import
            <input
              className="sr-only"
              type="file"
              accept=".csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const parsed = Papa.parse<Record<string, string>>(
                    await file.text(),
                    { header: true, skipEmptyLines: "greedy" },
                  );
                  if (
                    parsed.errors.length ||
                    !parsed.meta.fields?.includes("name")
                  )
                    throw Error(
                      "CSV needs a name column and valid quoted fields.",
                    );
                  await save(
                    parsed.data.map(({ name, tags, ...data }) => ({
                      kind,
                      name,
                      tags:
                        tags
                          ?.split(",")
                          .map((t) => t.trim())
                          .filter(Boolean) || [],
                      data: { status: db.settings.stages[0], ...data },
                    })),
                  );
                } catch (err) {
                  notice((err as Error).message);
                }
              }}
            />
          </label>
        )}
      </div>
      {
        <div className="tabs">
          <button
            className={!archived ? "active" : ""}
            onClick={() => {
              archive(false);
              select([]);
            }}
          >
            Current
          </button>
          <button
            className={archived ? "active" : ""}
            onClick={() => {
              archive(true);
              select([]);
            }}
          >
            Archived
          </button>
        </div>
      }
      {selected.length > 0 && (
        <div className="tools">
          {selected.length} selected{" "}
          <button
            onClick={() => {
              if (confirm("Change archive status for the selected records?"))
                void bulk((r) => ({ ...r, archived: !archived }));
            }}
          >
            {archived ? "Restore" : "Archive"}
          </button>
          {kind === "lead" && (
            <>
              <select
                aria-label="Set stage"
                value=""
                onChange={(e) => {
                  const status = e.target.value;
                  void bulk((r) => ({ ...r, data: { ...r.data, status } }));
                }}
              >
                <option value="">Set stage…</option>
                {db.settings.stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </>
          )}
          {kind === "task" && (
            <button
              onClick={() =>
                void bulk((r) => ({
                  ...r,
                  data: { ...r.data, status: "Completed" },
                }))
              }
            >
              Complete
            </button>
          )}
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select page"
                    checked={
                      !!shown.length &&
                      shown.every((r) => selected.includes(r.id))
                    }
                    onChange={(e) =>
                      select(e.target.checked ? shown.map((r) => r.id) : [])
                    }
                  />
                </th>
              }
              <th>
                <button onClick={() => sort(!reverse)}>
                  Name <ArrowUpDown size={12} />
                </button>
              </th>
              {cols.map((c) => (
                <th key={c}>{label(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                {
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"Select " + r.name}
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        select(
                          e.target.checked
                            ? [...selected, r.id]
                            : selected.filter((x) => x !== r.id),
                        )
                      }
                    />
                  </td>
                }
                <td>
                  <button className="record" onClick={() => open(r)}>
                    <span className="avatar">{initials(r.name)}</span>
                    {r.name}
                  </button>
                </td>
                {cols.map((c) => (
                  <td key={c}>
                    {c === "status" && kind === "lead" ? (
                      <select
                        className="stagepicker"
                        aria-label={"Stage for " + r.name}
                        value={r.data.status}
                        onChange={(e) => update(r, e.target.value)}
                      >
                        {Array.from(
                          new Set([...db.settings.stages, r.data.status]),
                        ).map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    ) : c === "status" ? (
                      <span className="pill">{r.data[c]}</span>
                    ) : c === "employee" ? (
                      db.rows.find((x) => x.id === r.employee_id)?.name ||
                      "Unassigned"
                    ) : c === "value" ? (
                      money(Number(r.data[c] || 0))
                    ) : (
                      r.data[c] || "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">No matching records.</p>}
      <footer>
        <small>
          {rows.length} records · Page {pageNo + 1} of{" "}
          {Math.max(1, Math.ceil(rows.length / 10))}
        </small>
        <button disabled={!pageNo} onClick={() => paginate(pageNo - 1)}>
          Previous
        </button>
        <button
          disabled={(pageNo + 1) * 10 >= rows.length}
          onClick={() => paginate(pageNo + 1)}
        >
          Next
        </button>
      </footer>
    </section>
  );
}
