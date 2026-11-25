import { useState } from "react";
import { Modal } from "./ui/dialog";
import { Timeline } from "./Operations";
import { label, plural, type Row, type Snapshot } from "../lib/model";
import { related } from "../lib/view";
import type { Draft } from "./Editor";
export function Profile({
  r,
  db,
  open,
  edit,
  close,
  convert,
  done,
  upload,
}: {
  r: Row;
  db: Snapshot;
  open: (r: Row) => void;
  edit: (r: Draft) => void;
  close: () => void;
  convert: (r: Row) => void;
  done: (r: Row) => void;
  upload: (id: string) => void;
}) {
  const [tab, select] = useState("Overview");
  const links = related(db.rows, r);
  const tabs = [
    "Overview",
    ...(["customer", "lead", "property", "contact"].includes(r.kind)
      ? [
          "Contacts",
          "Properties",
          "Services",
          "Notes",
          "Activity",
          "Tasks",
          "Appointments",
          "Documents",
        ]
      : []),
  ];
  const tabRows = links
    .filter((x) =>
      tab === "Activity"
        ? ["activity", "communication"].includes(x.kind)
        : tab === "Appointments"
          ? x.kind === "appointment"
          : plural[x.kind] === tab,
    )
    .sort(
      (a, b) =>
        Number(b.data.pinned === "Yes") - Number(a.data.pinned === "Yes") ||
        b.created_at.localeCompare(a.created_at),
    );
  return (
    <Modal title={r.name} close={close}>
      <div className="profilebar">
        <span className="pill">{label(r.kind)}</span>
        {r.data.status && <span>{r.data.status}</span>}
        <small>Added {r.created_at.slice(0, 10)}</small>
      </div>
      <div className="tabs scroll">
        {tabs.map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            onClick={() => select(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" &&
        links.some((x) => x.kind === "note" && x.data.pinned === "Yes") && (
          <section>
            <h3 className="groupname">Pinned notes</h3>
            <Timeline
              rows={links.filter(
                (x) => x.kind === "note" && x.data.pinned === "Yes",
              )}
              open={open}
            />
          </section>
        )}
      {tab === "Overview" ? (
        <div className="facts">
          {Object.entries({
            ...r.data,
            ...(r.kind === "customer" ? { customer_id: r.id } : {}),
            tags: r.tags.join(", "),
            assigned_employee: db.rows.find((x) => x.id === r.employee_id)
              ?.name,
            associated_record: db.rows.find((x) => x.id === r.parent_id)?.name,
          })
            .filter(([k, v]) => v && k !== "key")
            .map(([k, v]) => (
              <div key={k}>
                <small>{label(k)}</small>
                {v}
              </div>
            ))}
        </div>
      ) : tab === "Services" ? (
        <p className="empty">
          {r.services.join(" · ") || "No services assigned."}
        </p>
      ) : (
        <Timeline rows={tabRows} open={open} />
      )}
      <footer>
        {r.kind === "document" ? (
          <>
            <a
              className="button"
              target="_blank"
              href={"/api/files?id=" + r.id}
            >
              Preview
            </a>
            <a className="button" href={"/api/files?download=1&id=" + r.id}>
              Download
            </a>
          </>
        ) : (
          r.kind !== "activity" && (
            <button onClick={() => edit(r)}>Edit {r.kind}</button>
          )
        )}
        {r.kind === "lead" && r.data.status === "Won" && (
          <button onClick={() => convert(r)}>Convert to customer</button>
        )}
        {r.kind === "task" && r.data.status !== "Completed" && (
          <button onClick={() => done(r)}>Mark complete</button>
        )}
        {["customer", "lead", "contact", "property"].includes(r.kind) && (
          <>
            <button
              onClick={() => edit({ kind: "communication", parent_id: r.id })}
            >
              Log communication
            </button>
            <select
              aria-label="Add related record"
              value=""
              onChange={(e) => {
                const k = e.target.value as Row["kind"];
                if (k === "document") upload(r.id);
                else edit({ kind: k, parent_id: r.id });
              }}
            >
              <option value="">Add related…</option>
              {[
                "note",
                "task",
                "contact",
                "property",
                "appointment",
                "document",
              ].map((k) => (
                <option value={k} key={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </>
        )}
      </footer>
    </Modal>
  );
}
