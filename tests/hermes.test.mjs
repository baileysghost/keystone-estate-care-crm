import test from "node:test";
import assert from "node:assert/strict";
import { handleHermes } from "../lib/hermes-http.mjs";
import { transaction, closeDatabase } from "../lib/database.mjs";
import { action, overview } from "../lib/intelligence.mjs";
import { seedDemo, removeDemo } from "../lib/hermes-demo.mjs";
import { randomUUID } from "node:crypto";
process.env.CRM_TEST_DB = "memory://";
process.env.HERMES_API_KEY = randomUUID();
const call = async (
  path,
  body,
  key = randomUUID(),
  token = process.env.HERMES_API_KEY,
) => {
  const req = new Request("https://example.com/api/v1/hermes/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const r = await handleHermes(req, path);
  return { status: r.status, ...(await r.json()) };
};
test("integration, retries, audit, permissions, demo isolation and preservation", async () => {
  try {
    const admin = {
        email: "admin@example.com",
        role: "administrator",
        employee_id: null,
      },
      employee = {
        email: "employee@example.com",
        role: "employee",
        employee_id: randomUUID(),
      };
    const cases = { case_number: "DEMO-1", jurisdiction: "Example County" },
      key = randomUUID();
    assert.equal((await call("health", null, key, "wrong")).status, 401);
    assert.equal((await call("leads", cases)).status, 503);
    await transaction((q) =>
      action(q, admin, { action: "settings", key: "enabled", value: true }),
    );
    assert.equal(
      (await call("leads", { ...cases, address: "forbidden" })).status,
      422,
    );
    assert.equal(
      (await call("leads", { ...cases, verification_status: "verified" }))
        .status,
      422,
    );
    const first = await call("leads", cases, key);
    assert.equal(first.status, 200);
    assert.equal(first.data.created, true);
    assert.deepEqual((await call("leads", cases, key)).data, first.data);
    assert.equal(
      (await call("leads", { ...cases, case_number: "other" }, key)).status,
      409,
    );
    assert.equal(
      (await call("leads", { ...cases, case_number: "demo1" })).data.duplicate,
      true,
    );
    assert.equal(
      (
        await call("case-updates", {
          ...cases,
          verification_status: "conflicting_information",
        })
      ).data.updated,
      true,
    );
    const p = {
      full_name: "Test Attorney",
      law_firm: "Test Firm",
      sources: [
        {
          source_name: "Fictional directory",
          source_type: "directory",
          source_url: "https://example.com",
        },
      ],
    };
    assert.equal((await call("attorneys", p)).data.created, true);
    assert.equal((await call("attorneys", p)).data.duplicate, true);
    assert.equal(
      (await call("batch", { cases: [cases], attorneys: [p] })).status,
      200,
    );
    for (const status of ["failed", "completed"]) {
      assert.equal(
        (await call("runs/start", { external_run_id: status })).status,
        200,
      );
      assert.equal(
        (await call("runs/complete", { external_run_id: status, status }))
          .status,
        200,
      );
    }
    const ids = [first.data.id];
    await assert.rejects(
      transaction((q) =>
        action(q, employee, { action: "note", ids, value: "Test" }),
      ),
    );
    await transaction((q) =>
      action(q, admin, { action: "stage", ids, value: "Verified" }),
    );
    await transaction((q) =>
      action(q, admin, {
        action: "follow-up",
        ids,
        value: "Review evidence",
        due: "2026-11-27",
      }),
    );
    await transaction(seedDemo);
    await transaction(seedDemo);
    const d = await transaction((q) => overview(q, admin, true));
    assert.deepEqual(
      [d.cases.length, d.attorneys.length, d.firms.length, d.runs.length],
      [10, 5, 3, 7],
    );
    await transaction(removeDemo);
    const live = await transaction((q) => overview(q, admin, false));
    assert.equal(live.cases.length, 1);
    assert.equal(live.tasks.length, 1);
    assert.equal(
      (
        await transaction((q) => q("select count(*)::int as n from contacts"))
      )[0].n,
      5,
    );
    const old = process.env.HERMES_API_KEY;
    process.env.HERMES_API_KEY = randomUUID();
    assert.equal((await call("health", null, key, old)).status, 401);
  } finally {
    await closeDatabase();
  }
});
