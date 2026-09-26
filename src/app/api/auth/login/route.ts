import { NextResponse } from "next/server";
import { authenticateUser } from "@/services/auth/store";
import {
  createSessionToken,
  requestUsesHttps,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/services/auth/session";
import {
  assertLoginAllowed,
  clearLoginAttempts,
  loginRateLimitKey,
  recordFailedLogin,
} from "@/services/auth/rateLimit";
import { assertSameOrigin } from "@/services/requestSecurity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim() || "";
    const password = body.password || "";
    const key = loginRateLimitKey(request, username);
    assertLoginAllowed(key);

    const user = await authenticateUser(username, password);
    if (!user) {
      recordFailedLogin(key);
      return NextResponse.json({ error: "Benutzername oder Passwort ist nicht korrekt." }, { status: 401 });
    }
    clearLoginAttempts(key);
    const response = NextResponse.json({ user });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(user),
      sessionCookieOptions(requestUsesHttps(request))
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die Anmeldung ist fehlgeschlagen." },
      { status: 400 }
    );
  }
}
