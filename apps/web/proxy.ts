import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Convenience only: redirects to /login when there is no session cookie at
// all. The API decides who is logged in (AGENTS.md -> Authentication
// invariants).
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/login") return NextResponse.next();
  if (request.cookies.has("compel_session")) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except /api (the OTP calls are made without a cookie), Next.js
  // assets, the favicon and any other file with an extension.
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.[^/]+$).*)",
  ],
};
