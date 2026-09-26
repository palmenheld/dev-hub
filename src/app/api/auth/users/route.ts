import { NextResponse } from "next/server";
import { createTemporaryPassword } from "@/services/auth/password";
import { getCurrentUser } from "@/services/auth/currentUser";
import { createUser, listUsers, updateUserByAdmin } from "@/services/auth/store";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { HubRole } from "@/types/auth";

async function admin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Diese Aktion ist nur für Administratoren verfügbar.");
  return user;
}

function role(value: unknown): HubRole {
  if (value !== "admin" && value !== "editor") throw new Error("Die ausgewählte Rolle ist ungültig.");
  return value;
}

export async function GET() {
  try {
    const actor = await admin();
    return NextResponse.json({ users: await listUsers(), actor });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zugriff verweigert." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await admin();
    const body = (await request.json()) as { username?: string; displayName?: string; role?: string };
    const temporaryPassword = createTemporaryPassword();
    const user = await createUser({
      username: body.username || "",
      displayName: body.displayName || "",
      role: role(body.role),
      password: temporaryPassword,
      mustChangePassword: true,
    });
    return NextResponse.json({ user, temporaryPassword }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Der Benutzer konnte nicht angelegt werden." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await admin();
    const body = (await request.json()) as {
      id?: string;
      displayName?: string;
      role?: string;
      active?: boolean;
      resetPassword?: boolean;
    };
    if (!body.id) throw new Error("Das Benutzerkonto fehlt.");
    const temporaryPassword = body.resetPassword ? createTemporaryPassword() : undefined;
    const user = await updateUserByAdmin({
      id: body.id,
      actorId: actor.id,
      displayName: body.displayName,
      role: body.role === undefined ? undefined : role(body.role),
      active: body.active,
      newPassword: temporaryPassword,
    });
    return NextResponse.json({ user, temporaryPassword });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Benutzerkonto konnte nicht geändert werden." },
      { status: 400 }
    );
  }
}
