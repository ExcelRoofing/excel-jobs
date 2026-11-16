import { actor, json, redirectTo } from "@/lib/http";
import { markAllNotificationsRead } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  await markAllNotificationsRead(auth.user.id);
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json") || request.headers.get("x-excel-json") === "1") return json({ ok: true });
  return redirectTo(request, "/alerts");
}
