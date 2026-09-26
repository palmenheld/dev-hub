import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/services/requestSecurity";
import { requestUsesHttps, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/services/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      ...sessionCookieOptions(requestUsesHttps(request)),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die Abmeldung ist fehlgeschlagen." },
      { status: 400 }
    );
  }
}
