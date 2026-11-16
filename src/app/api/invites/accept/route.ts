import { setSessionCookie, setLocaleCookie } from "@/lib/session";
import { fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { getLocale } from "@/lib/i18n";
import { hashPassword } from "@/lib/password";
import { acceptInvite, AppError, setUserLocale } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const input = await readRequest(request);
  const token = field(input, "token");
  const next = `/invite/${token}`;
  try {
    const password = field(input, "password");
    const again = field(input, "again");
    if (password.length < 8) throw new AppError("weak_password");
    if (password !== again) throw new AppError("password_mismatch");
    const userId = await acceptInvite({ token, name: field(input, "name"), passwordHash: hashPassword(password) });
    const locale = (await getLocale()) === "fr" ? "fr" : "en";
    await setUserLocale(userId, locale);
    await setSessionCookie(userId);
    await setLocaleCookie(locale);
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, "/jobs");
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
