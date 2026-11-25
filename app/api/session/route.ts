import { NextResponse } from "next/server";
import { authClient, cookie, membership, denied } from "../../../lib/staff.mjs";
import { checkOrigin } from "../../../lib/api";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const b = z
      .strictObject({
        action: z.enum([
          "login",
          "logout",
          "reset",
          "recover",
          "refresh",
          "activate",
        ]),
        email: z.email().optional(),
        password: z.string().max(256).optional(),
        access: z.string().max(12000).optional(),
        refresh: z.string().max(1000).optional(),
      })
      .parse(await req.json());
    const client = authClient(),
      res = NextResponse.json(
        { success: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    const options = {
      httpOnly: true,
      secure: !!process.env.VERCEL,
      sameSite: "lax" as const,
      path: "/",
    };
    if (b.action === "logout") {
      const token = cookie(req, "ks_access");
      if (token) {
        await client.auth.admin.signOut(token, "local");
      }
      res.cookies.delete("ks_access");
      res.cookies.delete("ks_refresh");
      return res;
    }
    if (b.action === "reset") {
      if (b.email && (await membership(b.email)))
        await client.auth.resetPasswordForEmail(b.email, {
          redirectTo: new URL("/login", process.env.CRM_ORIGIN || req.url).href,
        });
      return res;
    }
    if (b.action === "activate") {
      if (!b.email || !b.password || b.password.length < 12) return denied();
      if (await membership(b.email)) {
        const { error } = await client.auth.signUp({
          email: b.email,
          password: b.password,
          options: {
            emailRedirectTo: new URL(
              "/login",
              process.env.CRM_ORIGIN || req.url,
            ).href,
          },
        });
        if (error)
          return Response.json(
            {
              error:
                "Account activation unavailable. Check account settings or retry later.",
            },
            { status: 400 },
          );
      }
      return res;
    }
    let session;
    if (b.action === "refresh") {
      const token = cookie(req, "ks_refresh");
      if (!token) return denied();
      session = (await client.auth.refreshSession({ refresh_token: token }))
        .data.session;
    }
    if (b.action === "login" && b.email && b.password)
      session = (
        await client.auth.signInWithPassword({
          email: b.email,
          password: b.password,
        })
      ).data.session;
    if (
      b.action === "recover" &&
      b.access &&
      b.refresh &&
      b.password &&
      b.password.length >= 12
    ) {
      session = (
        await client.auth.setSession({
          access_token: b.access,
          refresh_token: b.refresh,
        })
      ).data.session;
      if (!session || !(await membership(session.user.email))) return denied();
      if ((await client.auth.updateUser({ password: b.password })).error)
        return denied();
    }
    if (
      !session ||
      !session.user.email_confirmed_at ||
      !(await membership(session.user.email))
    )
      return denied();
    res.cookies.set("ks_access", session.access_token, {
      ...options,
      maxAge: session.expires_in,
    });
    res.cookies.set("ks_refresh", session.refresh_token, {
      ...options,
      maxAge: 7 * 86400,
    });
    return res;
  } catch {
    return denied();
  }
}
