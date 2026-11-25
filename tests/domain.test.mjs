import test, { after } from "node:test";
import assert from "node:assert/strict";
import { transaction, closeDatabase } from "../lib/database.mjs";
import { save, snapshot, convert } from "../lib/repository.mjs";
process.env.CRM_DEMO_MODE = "fictional";
process.env.CRM_TEST_DB = "memory://";
delete process.env.DATABASE_URL;
test("migration, seed, transaction rollback, conversion and history", async () => {
  const { rows } = await snapshot();
  for (const [k, n] of Object.entries({
    lead: 20,
    customer: 10,
    property: 15,
    contact: 25,
    task: 20,
    appointment: 10,
    employee: 4,
  }))
    assert.equal(rows.filter((x) => x.kind === k).length, n);
  const lead = rows.find((r) => r.kind === "lead");
  const data = { ...lead.data, status: "Won" };
  await transaction((q) => save(q, { ...lead, data }));
  await assert.rejects(
    transaction((q) => save(q, { ...lead, id: null })),
    /duplicate/i,
  );
  const note = await transaction((q) =>
    save(q, {
      kind: "note",
      parent_id: lead.id,
      name: "Pinned note",
      data: { pinned: "Yes" },
    }),
  );
  const prop = await transaction((q) =>
    save(q, {
      kind: "property",
      parent_id: lead.id,
      name: "Example House",
      data: {},
    }),
  );
  const customer = await transaction((q) => convert(q, lead.id));
  assert.equal(await transaction((q) => convert(q, lead.id)), customer);
  const result = (await snapshot()).rows;
  assert.equal(result.find((r) => r.id === prop).parent_id, customer);
  assert.equal(result.find((r) => r.id === note).parent_id, lead.id);
  assert.ok(result.find((r) => r.id === customer).links.includes(lead.id));
  const task = rows.find((r) => r.kind === "task");
  await transaction((q) =>
    save(q, { ...task, data: { ...task.data, status: "Completed" } }),
  );
  assert.ok(
    (await snapshot()).rows.find((r) => r.id === task.id).data.completed_on,
  );
  await assert.rejects(
    transaction(async (q) => {
      await save(q, { kind: "lead", name: "Rollback marker", data: {} });
      throw Error("rollback");
    }),
  );
  assert.ok(!(await snapshot()).rows.some((r) => r.name === "Rollback marker"));
});

after(closeDatabase);
