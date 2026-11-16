import { getCurrentUser } from "@/lib/auth";
import { setLocaleCookie } from "@/lib/session";
import { setUserLocale } from "@/lib/services";
import { redirectTo } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const locale = form.get("locale") === "fr" ? "fr" : "en";
  await setLocaleCookie(locale);
  const user = await getCurrentUser();
  if (user) await setUserLocale(user.id, locale);
  return redirectTo(request, String(form.get("next") || "/jobs"));
}
