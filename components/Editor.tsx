"use client";
import { useEffect, useState } from "react";
import { Modal } from "./ui/dialog";
import {
  choices,
  dates,
  fields,
  label,
  today,
  type Row,
  type Kind,
  type Snapshot,
} from "../lib/model";
export type Draft = Partial<Row> & { kind: Kind };
export function Editor({
  draft,
  db,
  close,
  submit,
}: {
  draft: Draft;
  db: Snapshot;
  close: () => void;
  submit: (r: Draft) => Promise<void>;
}) {
  const [r, set] = useState<Draft>(() => {
    const data: Record<string, string> = {};
    for (const f of fields[draft.kind]) {
      const opts = choices(draft.kind, f, db.settings);
      if (opts) data[f] = opts[0];
    }
    if (["appointment", "communication", "task"].includes(draft.kind))
      data.due = today();
    return {
      name: "",
      tags: [],
      links: [],
      services: [],
      ...draft,
      data: { ...data, ...draft.data },
    };
  });
  const [dirty, mark] = useState(false),
    [busy, wait] = useState(false),
    [err, error] = useState("");
  function change(v: Partial<Row>) {
    mark(true);
    set({ ...r, ...v });
  }
  function leave() {
    if (!busy && (!dirty || confirm("Discard your unsaved changes?"))) close();
  }
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const targets = db.rows.filter(
    (x) =>
      ["lead", "property", "customer", "contact"].includes(x.kind) &&
      !x.archived &&
      x.id !== r.id,
  );
  return (
    <Modal title={(r.id ? "Edit " : "New ") + r.kind} close={leave}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          wait(true);
          try {
            await submit(r);
            close();
          } catch (e) {
            error((e as Error).message);
          } finally {
            wait(false);
          }
        }}
      >
        <div className="formgrid">
          <label className="wide">
            Name or title
            <input
              autoFocus
              required
              maxLength={240}
              value={r.name}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          {fields[r.kind].map((f) => {
            const opts = choices(r.kind, f, db.settings);
            const props = {
              value: r.data?.[f] || "",
              onChange: (
                e: React.ChangeEvent<
                  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                >,
              ) => change({ data: { ...r.data, [f]: e.target.value } }),
            };
            return (
              <label key={f}>
                {label(f)}
                {opts ? (
                  <select {...props}>
                    {Array.from(
                      new Set([...opts, ...(props.value ? [props.value] : [])]),
                    ).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : [
                    "instructions",
                    "description",
                    "preferences",
                    "maintenance",
                  ].includes(f) ? (
                  <textarea {...props} />
                ) : (
                  <input
                    {...props}
                    type={
                      dates.has(f)
                        ? "date"
                        : f.includes("time") && f !== "preferred_times"
                          ? "time"
                          : f.includes("email")
                            ? "email"
                            : [
                                  "square_feet",
                                  "monthly_value",
                                  "value",
                                ].includes(f)
                              ? "number"
                              : "text"
                    }
                    required={
                      f === "due" && ["task", "appointment"].includes(r.kind)
                    }
                    min="0"
                    step="any"
                  />
                )}
              </label>
            );
          })}
          {r.kind !== "employee" && (
            <>
              <label>
                Assigned employee
                <select
                  value={r.employee_id || ""}
                  onChange={(e) =>
                    change({ employee_id: e.target.value || null })
                  }
                >
                  <option value="">Unassigned</option>
                  {db.rows
                    .filter((x) => x.kind === "employee" && !x.archived)
                    .map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Associated record
                <select
                  value={r.parent_id || ""}
                  onChange={(e) =>
                    change({ parent_id: e.target.value || null })
                  }
                >
                  <option value="">None</option>
                  {targets.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {x.kind}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {r.kind === "contact" && (
            <label className="wide">
              Additional relationships
              <select
                multiple
                value={r.links}
                onChange={(e) =>
                  change({
                    links: Array.from(e.target.selectedOptions, (x) => x.value),
                  })
                }
              >
                {targets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {["lead", "customer", "property"].includes(r.kind) && (
            <fieldset className="wide">
              <legend>Services</legend>
              {db.settings.services.map((v) => (
                <label className="inline" key={v}>
                  <input
                    type="checkbox"
                    checked={r.services?.includes(v) || false}
                    onChange={(e) =>
                      change({
                        services: e.target.checked
                          ? [...(r.services || []), v]
                          : r.services?.filter((x) => x !== v),
                      })
                    }
                  />
                  {v}
                </label>
              ))}
            </fieldset>
          )}
          {["lead", "customer", "property", "contact"].includes(r.kind) && (
            <>
              <label className="wide">
                Tags, separated by commas
                <input
                  defaultValue={r.tags?.join(", ")}
                  list="tagOptions"
                  onChange={(e) =>
                    change({
                      tags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <datalist id="tagOptions">
                  {db.settings.tags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </datalist>
              </label>
              <label className="wide">
                Notes
                <textarea
                  value={r.data?.notes || ""}
                  onChange={(e) =>
                    change({ data: { ...r.data, notes: e.target.value } })
                  }
                />
              </label>
            </>
          )}
        </div>
        {err && <p role="alert">{err}</p>}
        <footer>
          <button type="button" onClick={leave}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save " + r.kind}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
