import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword, passwordMatches } from "@/services/auth/password";
import type { HubRole, HubUser, PublicHubUser } from "@/types/auth";

type UserFile = { version: 1; users: HubUser[] };

let mutationQueue: Promise<unknown> = Promise.resolve();

function dataDirectory() {
  return process.env.HUB_AUTH_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "auth");
}

function userFilePath() {
  return path.join(dataDirectory(), "users.json");
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(normalized)) {
    throw new Error("Der Benutzername muss 3 bis 64 Zeichen lang sein und darf nur Kleinbuchstaben, Zahlen, Punkt, Minus und Unterstrich enthalten.");
  }
  return normalized;
}

function publicUser(user: HubUser): PublicHubUser {
  const { passwordHash, passwordSalt, ...safe } = user;
  void passwordHash;
  void passwordSalt;
  return safe;
}

async function readUsers(): Promise<UserFile> {
  try {
    const parsed = JSON.parse(await readFile(userFilePath(), "utf8")) as UserFile;
    return { version: 1, users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, users: [] };
    throw error;
  }
}

async function writeUsers(value: UserFile) {
  await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
  const target = userFilePath();
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

async function mutate<T>(callback: (value: UserFile) => Promise<T> | T): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const value = await readUsers();
    const result = await callback(value);
    await writeUsers(value);
    return result;
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function listUsers() {
  const value = await readUsers();
  return value.users.map(publicUser).sort((a, b) => a.username.localeCompare(b.username, "de"));
}

export async function findUserById(id: string) {
  const value = await readUsers();
  const user = value.users.find((candidate) => candidate.id === id);
  return user ? publicUser(user) : null;
}

export async function authenticateUser(username: string, password: string) {
  const normalized = normalizeUsername(username);
  const value = await readUsers();
  const user = value.users.find((candidate) => candidate.username === normalized);
  if (!user || !user.active || !passwordMatches(password, user.passwordSalt, user.passwordHash)) return null;

  return mutate((latest) => {
    const current = latest.users.find((candidate) => candidate.id === user.id);
    if (!current || !current.active) return null;
    current.lastLoginAt = new Date().toISOString();
    current.updatedAt = current.lastLoginAt;
    return publicUser(current);
  });
}

export async function createUser(input: {
  username: string;
  displayName: string;
  role: HubRole;
  password: string;
  mustChangePassword?: boolean;
}) {
  const username = validateUsername(input.username);
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("Bitte einen Anzeigenamen angeben.");
  const credentials = hashPassword(input.password);

  return mutate((value) => {
    if (value.users.some((user) => user.username === username)) {
      throw new Error("Dieser Benutzername ist bereits vergeben.");
    }
    const now = new Date().toISOString();
    const user: HubUser = {
      id: randomUUID(),
      username,
      displayName,
      role: input.role,
      active: true,
      mustChangePassword: input.mustChangePassword ?? true,
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
    };
    value.users.push(user);
    return publicUser(user);
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const credentials = hashPassword(newPassword);
  return mutate((value) => {
    const user = value.users.find((candidate) => candidate.id === userId);
    if (!user || !user.active) throw new Error("Das Benutzerkonto ist nicht verfügbar.");
    if (!passwordMatches(currentPassword, user.passwordSalt, user.passwordHash)) {
      throw new Error("Das bisherige Passwort ist nicht korrekt.");
    }
    user.passwordSalt = credentials.salt;
    user.passwordHash = credentials.hash;
    user.mustChangePassword = false;
    user.sessionVersion += 1;
    user.updatedAt = new Date().toISOString();
    return publicUser(user);
  });
}

export async function updateUserByAdmin(input: {
  id: string;
  actorId: string;
  displayName?: string;
  role?: HubRole;
  active?: boolean;
  newPassword?: string;
}) {
  const credentials = input.newPassword ? hashPassword(input.newPassword) : null;
  return mutate((value) => {
    const user = value.users.find((candidate) => candidate.id === input.id);
    if (!user) throw new Error("Das Benutzerkonto wurde nicht gefunden.");
    if (input.id === input.actorId && input.active === false) {
      throw new Error("Du kannst dein eigenes Konto nicht sperren.");
    }
    if (input.id === input.actorId && input.role && input.role !== "admin") {
      throw new Error("Du kannst dir die eigene Administratorrolle nicht entziehen.");
    }
    const removesAdmin = user.role === "admin" && (input.role === "editor" || input.active === false);
    if (removesAdmin && value.users.filter((candidate) => candidate.role === "admin" && candidate.active).length <= 1) {
      throw new Error("Mindestens ein aktiver Administrator muss bestehen bleiben.");
    }
    if (typeof input.displayName === "string") {
      const displayName = input.displayName.trim();
      if (!displayName) throw new Error("Der Anzeigename darf nicht leer sein.");
      user.displayName = displayName;
    }
    if (input.role) user.role = input.role;
    if (typeof input.active === "boolean") user.active = input.active;
    if (credentials) {
      user.passwordSalt = credentials.salt;
      user.passwordHash = credentials.hash;
      user.mustChangePassword = true;
    }
    user.sessionVersion += 1;
    user.updatedAt = new Date().toISOString();
    return publicUser(user);
  });
}
