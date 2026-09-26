import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findUserById } from "@/services/auth/store";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/services/auth/session";
import type { PublicHubUser } from "@/types/auth";

export async function getCurrentUser(): Promise<PublicHubUser | null> {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  const user = await findUserById(session.sub);
  if (!user || !user.active || user.sessionVersion !== session.sessionVersion) return null;
  return user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminUser() {
  const user = await requireCurrentUser();
  if (user.role !== "admin") throw new Error("Diese Aktion ist nur für Administratoren verfügbar.");
  return user;
}
