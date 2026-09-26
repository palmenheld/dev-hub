import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const accounts = [
  { username: "palmenheld_thorsten", displayName: "Thorsten", role: "admin" },
  { username: "palmenheld_joern", displayName: "Jörn", role: "editor" },
  { username: "palmenheld_rene", displayName: "René", role: "editor" },
];

const directory = process.env.HUB_AUTH_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "auth");
const target = path.join(directory, "users.json");

async function readExisting() {
  try {
    const parsed = JSON.parse(await readFile(target, "utf8"));
    return { version: 1, users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, users: [] };
    throw error;
  }
}

function credentials(password) {
  const salt = randomBytes(16).toString("hex");
  return { passwordSalt: salt, passwordHash: scryptSync(password, salt, 64).toString("hex") };
}

const value = await readExisting();
const created = [];

for (const account of accounts) {
  if (value.users.some((user) => user.username === account.username)) continue;
  const password = `${randomBytes(12).toString("base64url")}aA7!`;
  const now = new Date().toISOString();
  value.users.push({
    id: randomUUID(),
    ...account,
    active: true,
    mustChangePassword: true,
    sessionVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...credentials(password),
  });
  created.push({ ...account, password });
}

await mkdir(directory, { recursive: true, mode: 0o700 });
const temporary = `${target}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, target);

if (created.length === 0) {
  console.log("Die drei vorgesehenen Benutzerkonten existieren bereits. Es wurde kein Passwort geändert.");
} else {
  console.log("Konten angelegt. Diese Startpasswörter werden nur jetzt angezeigt:");
  console.table(created.map(({ username, displayName, role, password }) => ({ username, displayName, role, password })));
  console.log("Bitte Passwörter sicher einzeln weitergeben. Beim ersten Login ist ein Passwortwechsel Pflicht.");
}
