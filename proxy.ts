import { NextResponse } from "next/server";
import { workspaceAccess } from "./lib/workspace-access.mjs";
export function proxy(request: Request) {
  return workspaceAccess(request) ?? NextResponse.next();
}
export const config = { matcher: ["/", "/api/:path*"] };
