import { today, type Row } from "./model";
export const openLead = (r: Row) =>
  r.kind === "lead" && !["Won", "Lost", "On Hold"].includes(r.data.status);
export function matches(r: Row, filter: string) {
  const d = r.data,
    day = today();
  switch (filter) {
    case "Today":
      return d.due === day && d.status !== "Completed";
    case "Upcoming":
      return !!d.due && d.due >= day && d.status !== "Completed";
    case "Overdue":
      return !!d.due && d.due < day && d.status !== "Completed";
    case "Overdue follow-ups":
      return openLead(r) && !!d.follow_up && d.follow_up < day;
    case "This month":
      return String(r.created_at).startsWith(day.slice(0, 7));
    case "Open pipeline":
      return openLead(r);
    case "All":
      return true;
    default:
      return d.status === filter || r.employee_id === filter;
  }
}
export function searchable(r: Row) {
  return [r.name, ...Object.values(r.data), ...r.tags, ...r.services]
    .join(" ")
    .toLowerCase();
}
export const initials = (s: string) =>
  s
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
export function related(rows: Row[], r: Row) {
  const ids = new Set([r.id, ...(r.kind === "customer" ? r.links : [])]);
  return rows.filter(
    (x) =>
      !x.archived &&
      x.id !== r.id &&
      (ids.has(x.parent_id || "") ||
        x.links.some((l) => ids.has(l)) ||
        r.links.includes(x.id) ||
        r.parent_id === x.id),
  );
}
export function exportCsv(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
