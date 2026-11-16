import { actor, json } from "@/lib/http";
import { saveSubscription, sendPush, vapidPublicKey } from "@/lib/push";
import { dictionary, translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const publicKey = vapidPublicKey();
  return json({ publicKey, enabled: Boolean(publicKey) });
}

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (body.action === "test") {
    const dict = dictionary(auth.user.locale);
    const sent = await sendPush(auth.user.id, {
      title: translate(dict, "testAlertTitle"),
      body: translate(dict, "testAlertBody"),
      url: "/alerts",
    });
    void sent;
    return json({ ok: true });
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys.auth) return json({ error: "bad_file" }, 400);
  saveSubscription(auth.user.id, { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
  return json({ ok: true });
}
