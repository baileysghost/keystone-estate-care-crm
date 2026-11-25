import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { schemas } from "./hermes-schema.mjs";
import { dispatch, settings, InputError } from "./hermes-store.mjs";
import { transaction } from "./database.mjs";
const digest = (s) => createHash("sha256").update(s).digest();
const limit = 256 * 1024;
async function read(req) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new InputError("Use application/json.", 415);
  if (Number(req.headers.get("content-length")) > limit)
    throw new InputError("Payload too large.", 413);
  const reader = req.body?.getReader(),
    parts = [];
  let size = 0;
  if (!reader) throw new InputError("Missing body.", 400);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new InputError("Payload too large.", 413);
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new InputError("Invalid JSON.", 400);
  }
}
export async function handleHermes(req, path) {
  const id = randomUUID(),
    respond = (status, data) =>
      Response.json(
        { success: status < 300, request_id: id, ...data },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
            ...(status === 429 ? { "Retry-After": "60" } : {}),
          },
        },
      );
  if (
    process.env.VERCEL &&
    new URL(req.url).protocol !== "https:" &&
    req.headers.get("x-forwarded-proto") !== "https"
  )
    return respond(403, { error: "HTTPS required." });
  const key = process.env.HERMES_API_KEY;
  if (!key || key.length < 32)
    return respond(503, { error: "Integration unavailable." });
  if (
    !timingSafeEqual(
      digest(req.headers.get("authorization") || ""),
      digest("Bearer " + key),
    )
  )
    return respond(401, { error: "Invalid credential." });
  let result;
  try {
    const allowed = await transaction(async (q) => {
      await q(
        "delete from hermes_rate where minute<now()-interval '2 minutes'",
      );
      const [r] = await q(
        "insert into hermes_rate values(date_trunc('minute',now()),1) on conflict(minute) do update set requests=hermes_rate.requests+1 returning requests",
      );
      return r.requests <= 120;
    });
    if (!allowed) throw new InputError("Rate limit reached.", 429);
    if (req.method === "GET") {
      const data = await transaction(async (q) => {
        const config = await settings(q);
        if (path === "health")
          return {
            status: "ok",
            database_connected: true,
            available: true,
            ingestion_enabled: config.enabled,
          };
        if (!config.enabled) throw new InputError("Ingestion disabled.", 503);
        if (path === "config") return config;
        if (path === "leads" || path === "attorneys") {
          const params = new URL(req.url).searchParams;
          const limit = Number(params.get("limit") ?? 50),
            offset = Number(params.get("offset") ?? 0);
          if (
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 200 ||
            !Number.isSafeInteger(offset) ||
            offset < 0
          )
            throw new InputError("Invalid pagination.", 400);
          const rows =
            path === "leads"
              ? await q(
                  "select id,data,stage as status from probate_cases where not demo and not archived and ($3::text is null or stage=$3) order by first_discovered_at desc,id limit $1 offset $2",
                  [limit, offset, params.get("status")],
                )
              : await q(
                  "select id,data from attorneys where not demo order by created_at desc,id limit $1 offset $2",
                  [limit, offset],
                );
          return {
            [path]: rows.map(({ id, data, status: attorneyStatus }) => ({
              id,
              ...(typeof data === "string" ? JSON.parse(data) : data),
              ...(attorneyStatus !== undefined ? { status: attorneyStatus } : {}),
            })),
            limit,
            offset,
          };
        }
        if (path === "research-requests")
          return q(
            "select id,case_id,description,created_at from research_requests where completed_at is null and not demo order by created_at limit 100",
          );
        throw new InputError("Unknown endpoint.", 404);
      });
      result = respond(200, {
        ...(["health", "leads", "attorneys"].includes(path) ? data : {}),
        data,
      });
    } else {
      if (!Object.hasOwn(schemas, path))
        throw new InputError("Unknown endpoint.", 404);
      const key = req.headers.get("idempotency-key") || "";
      if (!/^[a-zA-Z0-9._:-]{8,160}$/.test(key))
        throw new InputError(
          "Provide an Idempotency-Key of 8–160 characters.",
          400,
        );
      const body = await read(req),
        parsed = schemas[path].safeParse(body);
      if (!parsed.success)
        throw new InputError(
          parsed.error.issues
            .map((e) => e.path.join(".") + " " + e.code)
            .join(", "),
          422,
        );
      const hash = digest(JSON.stringify([path, body])).toString("hex");
      const data = await transaction(async (q) => {
        await q("select pg_advisory_xact_lock(614092)");
        const config = await settings(q);
        if (!config.enabled) throw new InputError("Ingestion disabled.", 503);
        const [receipt] = await q(
          "select * from hermes_receipts where key=$1",
          [key],
        );
        if (receipt) {
          if (receipt.digest !== hash)
            throw new InputError(
              "Idempotency key already used for a different request.",
              409,
            );
          return receipt.response;
        }
        const data = await dispatch(q, path, parsed.data, config);
        await q(
          "insert into hermes_receipts(key,digest,response) values($1,$2,$3::text::jsonb)",
          [key, hash, JSON.stringify(data)],
        );
        return data;
      });
      result = respond(200, { data });
    }
  } catch (e) {
    result = respond(e instanceof InputError ? e.status : 503, {
      error: e instanceof InputError ? e.message : "Service unavailable.",
    });
  }
  try {
    await transaction((q) =>
      q("insert into hermes_audit(id,endpoint,status) values($1,$2,$3)", [
        id,
        path.slice(0, 120),
        result.status,
      ]),
    );
  } catch {
    return respond(503, {
      error: "Audit unavailable. Retry using the same key.",
    });
  }
  return result;
}
