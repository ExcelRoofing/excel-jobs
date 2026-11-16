import { login } from "@/lib/auth";
import { json, redirectTo } from "@/lib/http";
import { safeNext } from "@/lib/safe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const type = request.headers.get("content-type") || "";
  const asJson = type.includes("application/json");
  const payload = asJson ? ((await request.json().catch(() => ({}))) as Record<string, string>) : null;
  const form = asJson ? null : await request.formData();
  const email = String(payload?.email ?? form?.get("email") ?? "");
  const password = String(payload?.password ?? form?.get("password") ?? "");
  const next = safeNext(String(payload?.next ?? form?.get("next") ?? "/jobs"));
  const user = await login(email, password);
  if (!user) {
    if (asJson) return json({ error: "bad_login" }, 401);
    return redirectTo(request, "/login", "bad_login");
  }
  if (asJson) return json({ ok: true, locale: user.locale }, 200);
  return redirectTo(request, next);
}
