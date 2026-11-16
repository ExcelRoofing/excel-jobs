import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { AppError } from "./services";
import { safeNext } from "./safe";
import type { User } from "./types";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function actor(): Promise<{ user: User } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { error: json({ error: "unauthorized" }, 401) };
  return { user };
}

export function fail(error: unknown) {
  if (error instanceof AppError) return json({ error: error.code }, error.status);
  console.error("[excel-jobs]", error);
  return json({ error: "server_error" }, 500);
}

export function originOf(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

export function redirectTo(request: Request, next: string, error?: string) {
  const url = new URL(safeNext(next), originOf(request));
  if (error) url.searchParams.set("e", error);
  else url.searchParams.delete("e");
  return NextResponse.redirect(url, 303);
}

export function wantsJson(request: Request) {
  return request.headers.get("x-excel-json") === "1" || (request.headers.get("accept") || "").includes("application/json");
}

export async function readRequest(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return { body, form: null as FormData | null, asJson: true };
  }
  const form = await request.formData();
  return { body: null as Record<string, unknown> | null, form, asJson: wantsJson(request) };
}

export function field(input: { body: Record<string, unknown> | null; form: FormData | null }, name: string) {
  if (input.form) return String(input.form.get(name) ?? "");
  const value = input.body?.[name];
  return value == null ? "" : String(value);
}

export function num(value: string) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
