import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { Locale } from "./types";

const COOKIE = "ej_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export function sessionSecret() {
  return process.env.SESSION_SECRET || "excel-jobs-dev-secret-change-me";
}

export function secretIsDefault() {
  return !process.env.SESSION_SECRET || process.env.SESSION_SECRET === "excel-jobs-dev-secret-change-me" || process.env.SESSION_SECRET === "change-me-to-a-long-random-string";
}

function sign(body: string) {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function signSession(uid: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const body = Buffer.from(JSON.stringify({ uid, exp })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { uid?: string; exp?: number };
    if (!payload.uid || !payload.exp || payload.exp < Date.now() / 1000) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}

function cookieBase() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "on",
    path: "/",
  };
}

export async function setSessionCookie(uid: string) {
  const jar = await cookies();
  jar.set(COOKIE, signSession(uid), { ...cookieBase(), maxAge: MAX_AGE });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

export async function readSessionUid() {
  const jar = await cookies();
  return readSessionToken(jar.get(COOKIE)?.value);
}

export async function setLocaleCookie(locale: Locale) {
  const jar = await cookies();
  jar.set("locale", locale, {
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "on",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
