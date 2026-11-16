import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 32;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const test = scryptSync(password, salt, KEYLEN);
  const got = Buffer.from(hash, "hex");
  if (got.length !== test.length) return false;
  return timingSafeEqual(got, test);
}

export function newSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
