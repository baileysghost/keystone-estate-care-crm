import { NextResponse } from "next/server";
export function proxy(req: Request) {
  if (
    (process.env.VERCEL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL) &&
    !/(?:^|;\s*)ks_access=[^;]+/.test(req.headers.get("cookie") || "")
  )
    return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/"] };
