import { changePassword, getCurrentUser } from "@/lib/auth";
import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { AppError } from "@/lib/services";
import { unreadSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const summary = await unreadSummary(user.id, user.role);
  return json({ summary });
}

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const input = await readRequest(request);
  try {
    const next = field(input, "next") || "/more";
    const password = field(input, "password");
    const again = field(input, "again");
    if (password.length < 8) throw new AppError("weak_password");
    if (password !== again) throw new AppError("password_mismatch");
    const ok = await changePassword(auth.user, field(input, "current"), password);
    if (!ok) throw new AppError("wrong_password");
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, `${next}?ok=password`);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, "/more", error instanceof Error ? error.message : "server_error");
  }
}
