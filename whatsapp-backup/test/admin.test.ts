import assert from "node:assert/strict";
import test from "node:test";
import { startAdmin, type AdminSnapshot } from "../src/admin.ts";

const sample: AdminSnapshot = {
  connection: "qr",
  detail: "Scan this QR code from the backup phone.",
  phone: null,
  groups: [{ jid: "111@g.us", name: "Chen reroof" }],
  hasQr: true,
  queue: { pending: 1, running: 0, dead: 2 },
  recent: [{ at: "2026-01-14T23:31:02.000Z", groupName: "Chen reroof", drivePath: "WhatsApp Backup/Chen reroof/2026-01-14/photo.jpg", kind: "image", jobsStatus: "uploaded", bytes: 10 }],
  lastError: "network down",
  drive: "ready",
  jobsPush: false,
  startedAt: "2026-01-14T20:00:00.000Z",
};

test("admin page shows status, hides itself without the token, and serves a QR image", async () => {
  let retries = 0;
  const admin = await startAdmin({
    host: "127.0.0.1",
    port: 0,
    token: "secret-token",
    getStatus: () => sample,
    getQr: () => "excel-whatsapp-backup-demo",
    onRetry: () => {
      retries += 1;
      return retries;
    },
  });
  const base = `http://127.0.0.1:${admin.port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const locked = await fetch(`${base}/`);
    assert.equal(locked.status, 401);
    const page = await fetch(`${base}/?token=secret-token`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Chen reroof/);
    assert.match(html, /network down/);
    assert.match(html, /Scan this QR code/);
    const cookie = page.headers.get("set-cookie") || "";
    assert.match(cookie, /wa_admin=/);
    const qr = await fetch(`${base}/qr.png`, { headers: { cookie: cookie.split(";")[0] } });
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await qr.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString("hex"), "89504e47");
    const retry = await fetch(`${base}/retry`, { method: "POST", headers: { cookie: cookie.split(";")[0] }, redirect: "manual" });
    assert.equal(retry.status, 303);
    assert.equal(retries, 1);
  } finally {
    await admin.close();
  }
});
