import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 12;

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  if (password.length > 256) {
    throw new Error("Das Passwort ist zu lang.");
  }
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  validatePassword(password);
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { salt, hash };
}

export function passwordMatches(password: string, salt: string, expectedHash: string) {
  try {
    const actual = scryptSync(password, salt, KEY_LENGTH);
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createTemporaryPassword() {
  return `${randomBytes(12).toString("base64url")}aA7!`;
}
