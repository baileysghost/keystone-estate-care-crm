import test from "node:test";
import assert from "node:assert/strict";
import { workspaceAccess } from "../lib/workspace-access.mjs";
test("external or hosted workspaces fail closed and require the shared credential", () => {
  const request = (auth = "") =>
    new Request("https://crm.example.test/api/files", {
      headers: { authorization: auth },
    });
  delete process.env.VERCEL;
  delete process.env.POSTGRES_URL;
  process.env.DATABASE_URL = "postgres://example.invalid/test";
  delete process.env.CRM_WORKSPACE_PASSWORD;
  assert.equal(workspaceAccess(request()).status, 503);
  process.env.CRM_WORKSPACE_PASSWORD = "fictional-unit-test-password";
  assert.equal(workspaceAccess(request()).status, 401);
  assert.equal(workspaceAccess(request("Basic incorrect")).status, 401);
  assert.equal(
    workspaceAccess(
      request(
        "Basic " +
          Buffer.from(
            "keystone:" + process.env.CRM_WORKSPACE_PASSWORD,
          ).toString("base64"),
      ),
    ),
    null,
  );
  delete process.env.DATABASE_URL;
  process.env.VERCEL = "1";
  assert.equal(workspaceAccess(request()).status, 401);
  delete process.env.VERCEL;
  assert.equal(workspaceAccess(request()), null);
});
