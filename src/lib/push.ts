import "server-only";
import fs from "fs";
import path from "path";
import webpush from "web-push";
import { dataDir, rows, run } from "./db";

type Keys = { publicKey: string; privateKey: string };

export function pushConfigured() {
  return Boolean(loadKeys());
}

function loadKeys(): Keys | null {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = path.join(dataDir(), "vapid.json");
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Keys;
      if (parsed.publicKey && parsed.privateKey) return parsed;
    } catch {
      return null;
    }
  }
  try {
    const keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
    return keys;
  } catch {
    return null;
  }
}

export function vapidPublicKey() {
  return loadKeys()?.publicKey || "";
}

export async function sendPush(userId: string, payload: { title: string; body: string; url?: string }) {
  const keys = loadKeys();
  if (!keys) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:info@excelroofing.ca", keys.publicKey, keys.privateKey);
  const subs = rows("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", userId);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: String(sub.endpoint), keys: { p256dh: String(sub.p256dh), auth: String(sub.auth) } },
          JSON.stringify(payload),
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) run("DELETE FROM push_subscriptions WHERE id = ?", String(sub.id));
      }
    }),
  );
}

export function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const id = crypto.randomUUID();
  run(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    id,
    userId,
    sub.endpoint,
    sub.keys.p256dh,
    sub.keys.auth,
    new Date().toISOString(),
  );
}
