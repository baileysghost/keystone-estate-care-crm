import { z } from "zod";
import { transaction } from "../../../lib/database.mjs";
import { snapshot, save, convert } from "../../../lib/repository.mjs";
import { defaults, fields, dates } from "../../../lib/model";
import { recordSchema, checkOrigin, problem } from "../../../lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const s = await snapshot();
    return Response.json(
      { ...s, settings: { ...defaults, ...s.settings } },
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
  try {
    checkOrigin(req);
    const body = await req.json();
    const result = await transaction(async (q: Query) => {
      if (body.action === "convert") return convert(q, z.uuid().parse(body.id));
      if (body.action === "settings") {
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
          "insert into company_settings values($1,$2) on conflict(key) do update set value=excluded.value",
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
        if (r.kind === "document") throw Error("Use the document upload form.");
        for (const [key, v] of Object.entries(r.data)) {
          if (
            !fields[r.kind].includes(key) &&
            !["last_contact", "notes"].includes(key)
          ) {
            delete r.data[key];
            continue;
          }
          if (!v) continue;
          if (dates.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(v))
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
        ids.push(await save(q, r));
      }
      return ids;
    });
    return Response.json({ result });
  } catch (e) {
    return problem(e);
  }
}
