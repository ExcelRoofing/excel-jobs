import "server-only";
import { one, ready, run } from "./db";
import { getUser, getUserByEmail } from "./queries";
import { hashPassword, verifyPassword } from "./password";
import { clearSessionCookie, readSessionUid, setLocaleCookie, setSessionCookie } from "./session";
import type { User } from "./types";

export async function getCurrentUser(): Promise<User | null> {
  const session = await readSessionUid();
  if (!session) return null;
  const user = await getUser(session.uid);
  if (!user?.active) return null;
  return user;
}

export async function login(email: string, password: string) {
  const found = await getUserByEmail(email);
  if (!found || !found.user.active || !verifyPassword(password, found.passwordHash)) return null;
  await setSessionCookie(found.user.id);
  await setLocaleCookie(found.user.locale);
  return found.user;
}

export async function logout() {
  await clearSessionCookie();
}

export async function changePassword(user: User, current: string, next: string) {
  await ready();
  const row = one("SELECT password_hash FROM users WHERE id = ?", user.id);
  const stored = row ? String(row.password_hash) : "";
  if (!stored || !verifyPassword(current, stored)) return false;
  if (next.length < 8) return false;
  run("UPDATE users SET password_hash = ?, is_demo = 0 WHERE id = ?", hashPassword(next), user.id);
  return true;
}
