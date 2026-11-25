import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
export const table = {
  employee: "employees",
  lead: "leads",
  customer: "customers",
  property: "properties",
  contact: "contacts",
  task: "tasks",
  appointment: "appointments",
  note: "notes",
  communication: "communications",
  document: "documents",
  activity: "activities",
};
async function open() {
  if (process.env.CRM_DEMO_MODE !== "fictional")
    throw Error("Set CRM_DEMO_MODE=fictional for the demonstration workspace.");
  if (process.env.DATABASE_URL) {
    const client = postgres(process.env.DATABASE_URL, {
      prepare: false,
      max: 3,
      ssl: "require",
    });
    return {
      close: () => client.end(),
      tx: (fn) =>
        client.begin(async (sql) => {
          await sql.unsafe("set local search_path=keystone,public");
          return fn(async (q, p = []) => Array.from(await sql.unsafe(q, p)));
        }),
    };
  }
  if (process.env.VERCEL)
    throw Error("Configure the dedicated demo database before deployment.");
  const dir = process.env.CRM_TEST_DB || path.join(process.cwd(), ".demo/db");
  if (dir !== "memory://") await fs.mkdir(dir, { recursive: true });
  const db = new PGlite(dir);
  if (
    !(
      await db.query(
        "select 1 from information_schema.schemata where schema_name='keystone'",
      )
    ).rows.length
  ) {
    await db.transaction(async (t) => {
      await t.exec(
        await fs.readFile("supabase/migrations/001_crm.sql", "utf8"),
      );
      await t.exec(await fs.readFile("supabase/seed.sql", "utf8"));
    });
  }
  return {
    close: () => db.close(),
    tx: (fn) =>
      db.transaction(async (t) => {
        await t.exec("set local search_path=keystone,public");
        return fn(async (q, p = []) => (await t.query(q, p)).rows);
      }),
  };
}
export async function transaction(fn) {
  globalThis.keystoneDB ??= open().catch((e) => {
    delete globalThis.keystoneDB;
    throw e;
  });
  return (await globalThis.keystoneDB).tx(fn);
}

export async function closeDatabase() {
  if (globalThis.keystoneDB) await (await globalThis.keystoneDB).close();
  delete globalThis.keystoneDB;
}
