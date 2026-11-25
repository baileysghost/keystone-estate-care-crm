import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function hermesAuth(request: Request): Response | null {
  const expectedKey = process.env.HERMES_API_KEY;
  if (!expectedKey) {
    return new Response(
      "HERMES_API_KEY is not configured on the server. Request the administrator to set this environment variable.",
      { status: 503 },
    );
  }
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Authorization: Bearer <key> required.", { status: 401 });
  }
  const provided = authHeader.slice(7);
  const digest = (v: string) => createHash("sha256").update(v).digest();
  try {
    if (
      !timingSafeEqual(digest("Bearer " + provided), digest("Bearer " + expectedKey))
    ) {
      return new Response("Invalid API key.", { status: 401 });
    }
  } catch {
    return new Response("Invalid authorization format.", { status: 401 });
  }
  return null;
}