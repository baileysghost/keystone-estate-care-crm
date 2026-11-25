import { staff, denied } from "../../../lib/staff.mjs";
import { transaction } from "../../../lib/database.mjs";
import { action, overview } from "../../../lib/intelligence.mjs";
import { handleHermes } from "../../../lib/hermes-http.mjs";
import { checkOrigin } from "../../../lib/api";
import { InputError } from "../../../lib/hermes-store.mjs";
import { ZodError } from "zod";
type Query = (
  sql: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = await staff(req);
  if (!u) return denied();
  return Response.json(
    await transaction((q: Query) =>
      overview(q, u, new URL(req.url).searchParams.get("demo") === "true"),
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: Request) {
  const u = await staff(req);
  if (!u) return denied();
  try {
    checkOrigin(req);
    const b = await req.json();
    if (b.action === "test") {
      if (u.role !== "administrator") return denied(403);
      const probe = new Request(new URL("/api/v1/hermes/health", req.url), {
        headers: {
          authorization: "Bearer " + process.env.HERMES_API_KEY,
          "x-forwarded-proto": "https",
        },
      });
      return handleHermes(probe, "health");
    }
    await transaction((q: Query) => action(q, u, b));
    return Response.json({ success: true });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof InputError || e instanceof ZodError
            ? e instanceof ZodError
              ? "Invalid form values."
              : e.message
            : "Unable to apply change.",
      },
      { status: e instanceof InputError ? e.status : 400 },
    );
  }
}
