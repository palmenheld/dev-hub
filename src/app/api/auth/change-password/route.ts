import { NextResponse } from "next/server";
import { changePassword } from "@/services/auth/store";
import { getCurrentUser } from "@/services/auth/currentUser";
import {
  createSessionToken,
  requestUsesHttps,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/services/auth/session";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "Bitte erneut anmelden." }, { status: 401 });
    const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
    const user = await changePassword(currentUser.id, body.currentPassword || "", body.newPassword || "");
    const response = NextResponse.json({ user });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(user),
      sessionCookieOptions(requestUsesHttps(request))
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Passwort konnte nicht geändert werden." },
      { status: 400 }
    );
  }
}
