import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { staff, canWrite } from "../lib/staff.mjs";
import { transaction, closeDatabase } from "../lib/database.mjs";
import { save } from "../lib/repository.mjs";
test("hosted sessions require a validated identity and enabled membership on every request", async () => {
  process.env.CRM_TEST_DB = "memory://";
  const accounts = {
    valid: "staff@example.com",
    unlisted: "other@example.com",
    admin: "admin@example.com",
  };
  const server = http.createServer((req, res) => {
    const email =
      accounts[(req.headers.authorization || "").replace("Bearer ", "")];
    res.setHeader("Content-Type", "application/json");
    if (!email) {
      res.statusCode = 401;
      res.end('{"error":"invalid_token"}');
      return;
    }
    res.end(
      JSON.stringify({
        id: "a3ae5424-bdb8-44fc-aa2c-860e6036ff78",
        email,
        email_confirmed_at: "2026-01-01T00:00:00Z",
        app_metadata: {},
        user_metadata: { role: "administrator" },
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00Z",
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const ids = await transaction(async (q) => {
      const emp = await save(q, { kind: "employee", name: "QA", data: {} });
      await q(
        "insert into employee_access(email,role,employee_id) values('staff@example.com','employee',$1),('admin@example.com','administrator',null)",
        [emp],
      );
      return [
        await save(q, {
          kind: "lead",
          name: "Assigned",
          employee_id: emp,
          data: {},
        }),
        await save(q, { kind: "lead", name: "Unassigned", data: {} }),
      ];
    });
    process.env.VERCEL = "1";
    process.env.SUPABASE_URL = "http://127.0.0.1:" + server.address().port;
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    const session = (token) =>
      staff(
        new Request("https://example.com/api/crm", {
          headers: token ? { cookie: "ks_access=" + token } : {},
        }),
      );
    assert.equal(await session(null), null);
    assert.equal(await session("invalid"), null);
    assert.equal(await session("unlisted"), null);
    const user = await session("valid");
    assert.equal(user.role, "employee");
    assert.equal((await session("admin")).role, "administrator");
    assert.equal(await transaction((q) => canWrite(q, user, ids[0])), true);
    assert.equal(await transaction((q) => canWrite(q, user, ids[1])), false);
    await transaction((q) =>
      q(
        "update employee_access set enabled=false where email='staff@example.com'",
      ),
    );
    assert.equal(await session("valid"), null);
  } finally {
    delete process.env.VERCEL;
    await closeDatabase();
    await new Promise((r) => server.close(r));
  }
});
