import { createHash, timingSafeEqual } from "node:crypto";
import { connectionUrl } from "./connection.mjs";

export function workspaceAccess(request) {
  if (!connectionUrl() && !process.env.VERCEL) return null;
  const password = process.env.CRM_WORKSPACE_PASSWORD;
  const headers = { "Cache-Control": "private, no-store" };
  if (!password || password.length < 16) {
    return new Response(
      "Configure CRM_WORKSPACE_PASSWORD with at least 16 characters in the server environment, then redeploy.",
      { status: 503, headers },
    );
  }
  const digest = (value) => createHash("sha256").update(value).digest();
  const expected =
    "Basic " + Buffer.from("keystone:" + password, "utf8").toString("base64");
  if (
    timingSafeEqual(
      digest(expected),
      digest(request.headers.get("authorization") || ""),
    )
  )
    return null;
  return new Response("Workspace sign-in required.", {
    status: 401,
    headers: {
      ...headers,
      "WWW-Authenticate": 'Basic realm="Keystone Estate Care", charset="UTF-8"',
    },
  });
}
