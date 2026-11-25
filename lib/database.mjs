import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { connectionUrl } from "./connection.mjs";
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
async function initialize(query, execute, sampleWorkspace = false) {
  await query("select pg_advisory_xact_lock(3157918)");
  const [state] = await query(
    "select to_regclass('keystone.records') as records, to_regclass('keystone.schema_migrations') as migrations",
  );
  if (!state.records) {
    await execute(await fs.readFile("supabase/migrations/001_crm.sql", "utf8"));
    if (sampleWorkspace)
      await execute(await fs.readFile("supabase/seed.sql", "utf8"));
  }
  if (
    state.migrations &&
    (
      await query(
        "select 1 from keystone.schema_migrations where version='003_test_contacts'",
      )
    ).length
  )
    return;
  await execute(
    await fs.readFile("supabase/migrations/003_test_contacts.sql", "utf8"),
  );
}
async function open() {
  const url = connectionUrl();
  if (url) {
    const client = postgres(url, { prepare: false, max: 3, ssl: "require" });
    try {
      await client.begin(async (sql) =>
        initialize(
          (q) => sql.unsafe(q),
          (q) => sql.unsafe(q).simple(),
        ),
      );
    } catch (e) {
      await client.end();
      throw e;
    }
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
    throw Error(
      "Set DATABASE_URL or POSTGRES_URL in the Vercel project, then redeploy.",
    );
  const dir = process.env.CRM_TEST_DB || path.join(process.cwd(), ".demo/db");
  if (dir !== "memory://") await fs.mkdir(dir, { recursive: true });
  const db = new PGlite(dir);
  try {
    await db.transaction(async (t) => {
      await initialize(
        async (q) => (await t.query(q)).rows,
        (q) => t.exec(q),
        process.env.CRM_SEED_SAMPLE_WORKSPACE === "true",
      );
      const applied = await t.query(
        "select 1 from keystone.schema_migrations where version='004_estate_stewardship'",
      );
      if (!applied.rows.length) {
        await t.exec(
          await fs.readFile(
            "supabase/migrations/004_estate_stewardship.sql",
            "utf8",
          ),
        );
        await t.exec(
          "insert into keystone.schema_migrations(version) values ('004_estate_stewardship')",
        );
      }
    });
  } catch (e) {
    await db.close();
    throw e;
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
