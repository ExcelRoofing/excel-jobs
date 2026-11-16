import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { timingSafeEqual } from "crypto";
import QRCode from "qrcode";
import type { UploadRow } from "./store.ts";

export type AdminSnapshot = {
  connection: string;
  detail: string;
  phone: string | null;
  groups: { jid: string; name: string }[];
  hasQr: boolean;
  queue: { pending: number; running: number; dead: number };
  recent: UploadRow[];
  lastError: string | null;
  drive: "ready" | "not_configured";
  jobsPush: boolean;
  startedAt: string;
};

export type AdminServer = {
  port: number;
  close: () => Promise<void>;
};

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);
}

export function renderStatus(status: AdminSnapshot): string {
  const rows = status.recent.length
    ? status.recent
        .map(
          (row) =>
            `<tr><td>${escapeHtml(row.at.replace("T", " ").slice(0, 19))}</td><td>${escapeHtml(row.groupName)}</td><td>${escapeHtml(row.drivePath)}</td><td>${escapeHtml(row.kind)}</td><td>${escapeHtml(row.jobsStatus || "—")}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5">Nothing backed up yet.</td></tr>`;
  const groups = status.groups.length
    ? `<ul>${status.groups.map((group) => `<li>${escapeHtml(group.name)}</li>`).join("")}</ul>`
    : "<p>No groups yet. Add this phone number to a job group.</p>";
  const qr = status.hasQr
    ? `<figure><img src="/qr.png" width="280" height="280" alt="WhatsApp login QR code"><figcaption>On the backup phone: WhatsApp, Settings, Linked devices, Link a device. Scan this code. This page never sends a message.</figcaption></figure>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="8">
  <title>WhatsApp backup</title>
  <style>
    body { margin: 0; font: 16px/1.45 Georgia, "Iowan Old Style", serif; background: #f4f1ea; color: #1c1915; }
    main { max-width: 880px; margin: 0 auto; padding: 24px 16px 48px; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    .muted { color: #5c564c; }
    .card { background: #fff; border: 1px solid #e2d9cc; border-radius: 12px; padding: 16px; margin: 12px 0; }
    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #e7f0e4; color: #1d4a28; font: 600 14px/1.4 system-ui, sans-serif; }
    .pill.warn { background: #f8e7c8; color: #6a4208; }
    .pill.bad { background: #f6d6d2; color: #6d2018; }
    figure { margin: 12px 0; }
    img { background: #fff; border: 1px solid #e2d9cc; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font: 14px/1.4 system-ui, sans-serif; }
    th, td { text-align: left; vertical-align: top; padding: 8px 6px; border-bottom: 1px solid #eee4d6; }
    button { font: 600 15px system-ui, sans-serif; background: #1d4a28; color: #fff; border: 0; border-radius: 8px; padding: 10px 14px; }
    code { font-family: ui-monospace, monospace; font-size: 0.92em; }
  </style>
</head>
<body>
<main>
  <h1>WhatsApp backup</h1>
  <p class="muted">Excel Roofing. Read only. Cette page n’écrit jamais dans les groupes.</p>
  <section class="card">
    <p><span class="pill ${status.connection === "connected" ? "" : status.connection === "logged_out" ? "bad" : "warn"}">${escapeHtml(status.connection)}</span></p>
    <p>${escapeHtml(status.detail || "Waiting.")}</p>
    <p class="muted">${status.phone ? `Phone ${escapeHtml(status.phone)}` : "Phone not linked yet"} · Drive ${status.drive === "ready" ? "ready" : "not set up"} · Excel Jobs copy ${status.jobsPush ? "on" : "off"}</p>
    ${qr}
  </section>
  <section class="card">
    <h2>Queue</h2>
    <p>Waiting ${status.queue.pending} · Working ${status.queue.running} · Needs a person ${status.queue.dead}</p>
    ${status.lastError ? `<p><strong>Last problem:</strong> ${escapeHtml(status.lastError)}</p>` : ""}
    ${status.queue.dead ? `<form method="post" action="/retry"><button type="submit">Retry failed backups</button></form>` : ""}
  </section>
  <section class="card">
    <h2>Groups</h2>
    ${groups}
  </section>
  <section class="card">
    <h2>Last backups</h2>
    <table>
      <thead><tr><th>When</th><th>Group</th><th>Drive path</th><th>Kind</th><th>Jobs</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  <p class="muted">Started ${escapeHtml(status.startedAt)}. This page refreshes itself.</p>
</main>
</body>
</html>`;
}

function send(res: ServerResponse, status: number, body: string, type: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...extra });
  res.end(body);
}

export async function startAdmin(opts: {
  host: string;
  port: number;
  token: string;
  getStatus: () => AdminSnapshot;
  getQr: () => string | null;
  onRetry: () => number;
}): Promise<AdminServer> {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, opts);
    } catch (error) {
      send(res, 500, error instanceof Error ? error.message : "error", "text/plain; charset=utf-8");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  return {
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { token: string; getStatus: () => AdminSnapshot; getQr: () => string | null; onRetry: () => number },
) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, JSON.stringify({ ok: true }), "application/json");
    return;
  }
  const header = req.headers.authorization || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const cookie = cookieValue(req.headers.cookie || "", "wa_admin");
  const query = url.searchParams.get("token") || "";
  const presented = bearer || cookie || query;
  if (opts.token && !same(presented, opts.token)) {
    send(res, 401, "This page needs the admin token. Open it as /?token= followed by ADMIN_TOKEN from the server settings.\n", "text/plain; charset=utf-8");
    return;
  }
  const cookieHeader: Record<string, string> = opts.token
    ? { "set-cookie": `wa_admin=${encodeURIComponent(opts.token)}; HttpOnly; SameSite=Strict; Path=/` }
    : {};
  if (req.method === "GET" && url.pathname === "/qr.png") {
    const qr = opts.getQr();
    if (!qr) {
      send(res, 404, "No QR code right now. The phone may already be linked.\n", "text/plain; charset=utf-8", cookieHeader);
      return;
    }
    const png = await QRCode.toBuffer(qr, { type: "png", width: 280, margin: 1 });
    res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", ...cookieHeader });
    res.end(png);
    return;
  }
  if (req.method === "POST" && url.pathname === "/retry") {
    opts.onRetry();
    send(res, 303, "", "text/plain; charset=utf-8", { location: "/", ...cookieHeader });
    return;
  }
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/status.json")) {
    const status = opts.getStatus();
    if (url.pathname === "/status.json") {
      send(res, 200, JSON.stringify(status, null, 2), "application/json", cookieHeader);
      return;
    }
    send(res, 200, renderStatus(status), "text/html; charset=utf-8", cookieHeader);
    return;
  }
  send(res, 404, "Not found\n", "text/plain; charset=utf-8");
}

function cookieValue(header: string, name: string): string {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
