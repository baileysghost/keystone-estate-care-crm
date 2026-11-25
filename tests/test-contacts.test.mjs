import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transaction, closeDatabase } from "../lib/database.mjs";
import { snapshot, save } from "../lib/repository.mjs";
test("fresh database starts with exactly five test contacts and preserves edits on restart", async () => {
  delete process.env.CRM_SEED_SAMPLE_WORKSPACE;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.CRM_DEMO_MODE;
  const directory = await mkdtemp(join(tmpdir(), "keystone-contacts-"));
  process.env.CRM_TEST_DB = directory;
  try {
    const rows = (await snapshot()).rows;
    assert.equal(rows.length, 5);
    assert.ok(
      rows.every(
        (r) =>
          r.kind === "contact" &&
          r.tags.includes("Test contact") &&
          r.data.email.endsWith("@example.test"),
      ),
    );
    await transaction((q) => save(q, { ...rows[0], name: "Revised fixture" }));
    await closeDatabase();
    const after = (await snapshot()).rows.filter((r) => r.kind === "contact");
    assert.equal(after.length, 5);
    assert.ok(after.some((r) => r.name === "Revised fixture"));
  } finally {
    await closeDatabase();
    await rm(directory, { recursive: true, force: true });
  }
});
