import "server-only";
import { z } from "zod";
import { entities } from "./model";
export const recordSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(entities).exclude(["activity"]),
  name: z.string().trim().min(1).max(240),
  data: z.record(z.string().max(50), z.string().max(8000)),
  updated_at: z.string().optional(),
  employee_id: z.uuid().nullish(),
  parent_id: z.uuid().nullish(),
  archived: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(100)).max(80).default([]),
  services: z.array(z.string().min(1).max(100)).max(80).default([]),
  links: z.array(z.uuid()).max(100).default([]),
});
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const url = new URL(origin);
  // Next can reconstruct the internal request URL with a loopback hostname.
  // The Host header retains the browser-facing authority, including its port.
  const host = req.headers.get("host") || new URL(req.url).host;
  if (
    url.host !== host ||
    !["https:", "http:"].includes(url.protocol) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw Error("Origin mismatch.");
}
export function problem(e: unknown) {
  const err = e as { code?: string; message?: string };
  const connectionErrors: Record<string, string> = {
    ENOTFOUND: "Database hostname could not be resolved.",
    ENETUNREACH: "Database network is unreachable.",
    ETIMEDOUT: "Database connection timed out.",
    CONNECT_TIMEOUT: "Database connection timed out.",
    CONNECTION_CLOSED: "The database closed the connection.",
    "28P01": "Database login was rejected.",
    "42501": "The CRM database login lacks a required permission.",
    "42P01": "The CRM schema is missing a required table.",
  };
  if (/tenant or user not found/i.test(err.message || ""))
    return Response.json(
      { error: "The pooler could not locate the Keystone database login." },
      { status: 503 },
    );
  if (err.code && connectionErrors[err.code])
    return Response.json(
      { error: connectionErrors[err.code] },
      { status: 503 },
    );
  let msg = "Unable to save or load the workspace.";
  if (err.code && /^[A-Z0-9_]{2,32}$/.test(err.code))
    msg += " Reference: " + err.code + ".";
  if (err.code === "23505")
    msg =
      "A matching record already exists. Review the email or linked record.";
  else if (err.code === "23503") msg = "A linked record is missing.";
  else if (e instanceof z.ZodError)
    msg = "Some values are invalid. Check the form and try again.";
  else if (
    !err.code &&
    err.message &&
    !/postgres|password|supabase|https?:|connect|ENOENT/i.test(err.message)
  )
    msg = err.message;
  return Response.json({ error: msg }, { status: 400 });
}
