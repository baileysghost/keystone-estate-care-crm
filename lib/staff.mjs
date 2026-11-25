import { createClient } from "@supabase/supabase-js";
import { transaction } from "./database.mjs";
import { connectionUrl } from "./connection.mjs";
export function authClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
export const hosted = () => Boolean(connectionUrl() || process.env.VERCEL);
export function cookie(req, key) {
  return (req.headers.get("cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(key + "="))
    ?.slice(key.length + 1);
}
export async function membership(email) {
  if (!email) return null;
  return (
    (
      await transaction((q) =>
        q(
          "select email,role,employee_id from employee_access where enabled and email=$1",
          [email.toLowerCase()],
        ),
      )
    )[0] || null
  );
}
export async function staff(req) {
  if (!hosted())
    return {
      role: "administrator",
      email: "local@example.com",
      employee_id: null,
    };
  const token = cookie(req, "ks_access");
  if (!token) return null;
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) return null;
  return membership(data.user.email);
}
export const denied = (status = 401) =>
  Response.json(
    {
      error:
        status === 401
          ? "Employee sign-in required."
          : "Administrator access required.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export async function canWrite(q, user, id) {
  if (user.role === "administrator") return true;
  if (!id) return false;
  return (
    (
      await q("select id from records where id=$1 and employee_id=$2", [
        id,
        user.employee_id,
      ])
    ).length > 0
  );
}
