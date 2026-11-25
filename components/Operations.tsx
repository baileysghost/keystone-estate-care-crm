import { useState } from "react";
import {
  DndContext,
  useDroppable,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { today, money, type Row, type Snapshot } from "../lib/model";
import { initials } from "../lib/view";
function Card({
  r,
  db,
  open,
  move,
}: {
  r: Row;
  db: Snapshot;
  open: (r: Row) => void;
  move: (r: Row, s: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform } = useDraggable({
    id: r.id,
  });
  return (
    <article
      className="deal"
      ref={setNodeRef}
      style={
        transform
          ? {
              transform:
                "translate(" + transform.x + "px," + transform.y + "px)",
              position: "relative",
              zIndex: 3,
            }
          : undefined
      }
    >
      <div>
        <button className="flat" onClick={() => open(r)}>
          <b>{r.name}</b>
        </button>
        <button aria-label={"Drag " + r.name} {...attributes} {...listeners}>
          <GripVertical size={14} />
        </button>
      </div>
      <small>
        {r.data.city || "Location pending"} · {r.data.priority || "Normal"}
      </small>
      <strong>{money(+r.data.value || 0)}</strong>
      <small>
        {db.rows.find((x) => x.id === r.employee_id)?.name || "Unassigned"}
      </small>
      <small>Last contact {r.data.last_contact || "—"}</small>
      <small>Follow-up {r.data.follow_up || "—"}</small>
      <select
        aria-label={"Move " + r.name}
        value={r.data.status}
        onChange={(e) => move(r, e.target.value)}
      >
        {db.settings.stages.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </article>
  );
}
function Column({
  stage,
  rows,
  children,
}: {
  stage: string;
  rows: Row[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section ref={setNodeRef} className={"stage " + (isOver ? "over" : "")}>
      <h3>
        {stage} <span>{rows.length}</span>
      </h3>
      <small>{money(rows.reduce((n, r) => n + (+r.data.value || 0), 0))}</small>
      {children}
    </section>
  );
}
export function Pipeline({
  db,
  open,
  move,
}: {
  db: Snapshot;
  open: (r: Row) => void;
  move: (r: Row, s: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={({ active, over }) => {
        const r = db.rows.find((x) => x.id === active.id);
        if (r && over && r.data.status !== over.id) move(r, String(over.id));
      }}
    >
      <div className="board">
        {Array.from(
          new Set([
            ...db.settings.stages,
            ...db.rows
              .filter((r) => r.kind === "lead" && !r.archived)
              .map((r) => r.data.status)
              .filter(Boolean),
          ]),
        ).map((s) => {
          const rows = db.rows.filter(
            (r) => r.kind === "lead" && !r.archived && r.data.status === s,
          );
          return (
            <Column key={s} stage={s} rows={rows}>
              {rows.map((r) => (
                <Card key={r.id} {...{ r, db, open, move }} />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}
export function Calendar({
  db,
  open,
  add,
}: {
  db: Snapshot;
  open: (r: Row) => void;
  add: (date: string) => void;
}) {
  const [mode, view] = useState("Month"),
    [anchor, set] = useState(today());
  const d = new Date(anchor + "T12:00");
  let count = 1;
  const start = new Date(d);
  if (mode === "Month") {
    start.setDate(1);
    start.setDate(1 - start.getDay());
    count = 42;
  } else if (mode === "Week") {
    start.setDate(d.getDate() - d.getDay());
    count = 7;
  } else if (mode === "Agenda") count = 30;
  function jump(n: number) {
    const date = new Date(d);
    if (mode === "Month") {
      date.setDate(1);
      date.setMonth(date.getMonth() + n);
    } else date.setDate(date.getDate() + n * count);
    set(today(date));
  }
  const rows = db.rows
    .filter(
      (r) =>
        !r.archived &&
        ["appointment", "task"].includes(r.kind) &&
        r.data.status !== "Completed",
    )
    .sort((a, b) => (a.data.time || "").localeCompare(b.data.time || ""));
  return (
    <section className="panel">
      <div className="tools">
        <button aria-label="Previous period" onClick={() => jump(-1)}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => set(today())}>Today</button>
        <button aria-label="Next period" onClick={() => jump(1)}>
          <ChevronRight size={14} />
        </button>
        <b>
          {d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </b>
        <select
          value={mode}
          aria-label="Calendar view"
          onChange={(e) => view(e.target.value)}
        >
          {["Month", "Week", "Day", "Agenda"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="calendar-scroll">
        <div
          className={mode === "Month" || mode === "Week" ? "calgrid" : "agenda"}
        >
          {Array.from({ length: count }, (_, i) => {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            const day = today(date);
            const items = rows.filter((r) => r.data.due === day);
            if (mode === "Agenda" && !items.length) return null;
            return (
              <div
                key={day}
                className={"calday " + (day === today() ? "current" : "")}
              >
                <button
                  className="flat"
                  aria-label={"Add appointment " + day}
                  onClick={() => add(day)}
                >
                  {date.toLocaleDateString("en-US", {
                    weekday: "short",
                    day: "numeric",
                  })}
                </button>
                {items.map((r) => (
                  <button
                    className={"event " + r.kind}
                    key={r.id}
                    onClick={() => open(r)}
                  >
                    {r.data.time} {r.name}
                  </button>
                ))}
              </div>
            );
          })}
          {mode === "Agenda" &&
            !rows.some(
              (r) =>
                r.data.due >= anchor &&
                r.data.due <= today(new Date(d.getTime() + 29 * 86400000)),
            ) && (
              <p className="empty">
                No appointments or deadlines in this period.
              </p>
            )}
        </div>
      </div>
    </section>
  );
}
export function Timeline({
  rows,
  open,
}: {
  rows: Row[];
  open: (r: Row) => void;
}) {
  return (
    <div>
      {rows.length ? (
        rows.map((r) => (
          <button className="line" key={r.id} onClick={() => open(r)}>
            <span className="avatar">{initials(r.kind)}</span>
            <span>
              <b>{r.name}</b>
              <small>{r.data.description || r.data.status || r.kind}</small>
            </span>
            <small>{String(r.created_at).slice(0, 10)}</small>
          </button>
        ))
      ) : (
        <p className="empty">No records here yet.</p>
      )}
    </div>
  );
}
