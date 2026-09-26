import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/services/auth/session";
import { findUserById } from "@/services/auth/store";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/blog/cron",
  "/api/channels/ebay/oauth/callback",
]);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/receipt/") || pathname.startsWith("/api/pos/receipts/");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session) {
    const user = await findUserById(session.sub);
    if (!user || !user.active || user.sessionVersion !== session.sessionVersion) session = null;
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(session.mustChangePassword ? "/account/password" : "/", request.url));
  }
  if (isPublicPath(pathname)) return NextResponse.next();
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Bitte erneut am Palmenheld Hub anmelden." }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (
    session.mustChangePassword &&
    pathname !== "/account/password" &&
    pathname !== "/api/auth/change-password" &&
    pathname !== "/api/auth/logout"
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Bitte zuerst das Startpasswort ändern." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/account/password", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|logo-palmenheld.png).*)"],
};
