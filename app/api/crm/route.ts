import { staff, denied, canWrite } from "../../../lib/staff.mjs";
import { z } from "zod";
import { transaction } from "../../../lib/database.mjs";
import { snapshot, save, convert } from "../../../lib/repository.mjs";
import { defaults, fields, dates } from "../../../lib/model";
import { recordSchema, checkOrigin, problem } from "../../../lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const user = await staff(req);
  if (!user) return denied();
  try {
    const s = await snapshot();
    return Response.json(
      {
        ...s,
        rows:
          user.role === "administrator"
            ? s.rows
            : s.rows.filter(
                (r: { id: string; employee_id: string }) =>
                  r.employee_id === user.employee_id ||
                  r.id === user.employee_id,
              ),
        settings: { ...defaults, ...s.settings },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return problem(e);
  }
}
type Query = (
  sql: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;
export async function POST(req: Request) {
  const user = await staff(req);
  if (!user) return denied();
  try {
    checkOrigin(req);
    const body = await req.json();
    const result = await transaction(async (q: Query) => {
      if (body.action === "convert") {
        if (!(await canWrite(q, user, body.id)))
          throw Error("Assignment required.");
        return convert(q, z.uuid().parse(body.id));
      }
      if (body.action === "settings") {
        if (user.role !== "administrator")
          throw Error("Administrator access required.");
        const key = z
          .enum(Object.keys(defaults) as [string, ...string[]])
          .parse(body.key);
        const vals = z
          .array(z.string().trim().min(1).max(240))
          .min(1)
          .max(100)
          .parse(body.values);
        if (
          key === "stages" &&
          (!vals.includes("Won") || !vals.includes("Lost"))
        )
          throw Error("Keep the Won and Lost stages for conversion reporting.");
        await q(
          "insert into company_settings values($1,$2::text::jsonb) on conflict(key) do update set value=excluded.value",
          [key, JSON.stringify([...new Set(vals)])],
        );
        if (key === "stages") {
          await q("delete from pipeline_stages");
          for (const [i, v] of vals.entries())
            await q(
              "insert into pipeline_stages(name,position) values($1,$2)",
              [v, i],
            );
        }
        return key;
      }
      if (body.action !== "save") throw Error("Unknown operation.");
      const records = z.array(recordSchema).min(1).max(500).parse(body.rows);
      const ids = [];
      for (const r of records) {
        if (user.role !== "administrator") {
          if (
            r.kind === "employee" ||
            r.kind === "document" ||
            (r.id && !(await canWrite(q, user, r.id))) ||
            (r.employee_id && r.employee_id !== user.employee_id)
          )
            throw Error("Assignment required.");
          for (const linked of [r.parent_id, ...r.links])
            if (linked && !(await canWrite(q, user, linked)))
              throw Error("Assignment required.");
          r.employee_id = user.employee_id;
        }
        let fileMeta: Record<string, string> | undefined;
        if (r.kind === "document") {
          if (!r.id) throw Error("Use the document upload form.");
          const [doc] = await q(
            "select data from documents where id=$1 for update",
            [r.id],
          );
          if (!doc) throw Error("Document missing.");
          const original = doc.data as Record<string, string>;
          fileMeta = { key: original.key, mime: original.mime };
        }
        for (const [key, v] of Object.entries(r.data)) {
          if (
            !fields[r.kind].includes(key) &&
            !["last_contact", "notes"].includes(key)
          ) {
            delete r.data[key];
            continue;
          }
          if (!v) continue;
          if (dates.has(key) && !z.iso.date().safeParse(v).success)
            throw Error("Enter a valid date.");
          if (
            ["value", "monthly_value", "square_feet"].includes(key) &&
            (!Number.isFinite(Number(v)) || Number(v) < 0)
          )
            throw Error("Enter a positive amount.");
          if (key.includes("email") && !z.email().safeParse(v).success)
            throw Error("Enter a valid email.");
        }
        if (["appointment", "task"].includes(r.kind) && !r.data.due)
          throw Error("Choose a due date.");
        if (fileMeta) Object.assign(r.data, fileMeta);
        ids.push(await save(q, r));
      }
      return ids;
    });
    return Response.json({ result });
  } catch (e) {
    return problem(e);
  }
}
