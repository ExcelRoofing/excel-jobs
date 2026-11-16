import "server-only";
import { importPKCS8, SignJWT } from "jose";
import { one, run } from "./db";

export type DriveMode = "off" | "on" | "misconfigured";

export function driveMode(): DriveMode {
  if (process.env.DRIVE_SYNC !== "on") return "off";
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    return "misconfigured";
  }
  return "on";
}

function privateKey() {
  return (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

let tokenCache: { value: string; exp: number } | null = null;

async function accessToken() {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.value;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const key = await importPKCS8(privateKey(), "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/drive" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Google token failed (${response.status})`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function driveFetch(url: string, init: RequestInit = {}) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

function quote(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureFolder(parentId: string, name: string) {
  const cacheKey = `${parentId}/${name}`;
  const cached = one("SELECT drive_id FROM drive_folders WHERE cache_key = ?", cacheKey);
  if (cached?.drive_id) return String(cached.drive_id);
  const q = `name = '${quote(name)}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const found = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  if (!found.ok) throw new Error(`Drive folder search failed (${found.status})`);
  const listed = (await found.json()) as { files?: { id: string }[] };
  let id = listed.files?.[0]?.id;
  if (!id) {
    const created = await driveFetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    });
    if (!created.ok) throw new Error(`Drive folder create failed (${created.status})`);
    id = ((await created.json()) as { id: string }).id;
  }
  run("INSERT INTO drive_folders (cache_key, drive_id) VALUES (?, ?) ON CONFLICT(cache_key) DO UPDATE SET drive_id = excluded.drive_id", cacheKey, id);
  return id;
}

export async function uploadToDrive(input: { jobName: string; folderName: string; filename: string; mime: string; bytes: Buffer }) {
  if (driveMode() !== "on") return null;
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";
  const jobFolder = await ensureFolder(root, input.jobName);
  const tagFolder = await ensureFolder(jobFolder, input.folderName);
  const boundary = `exceljobs${Date.now()}`;
  const meta = Buffer.from(JSON.stringify({ name: input.filename, parents: [tagFolder] }), "utf8");
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    meta,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${input.mime}\r\n\r\n`),
    input.bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
  );
  if (!response.ok) throw new Error(`Drive upload failed (${response.status})`);
  const json = (await response.json()) as { id: string };
  return { fileId: json.id, path: `${input.jobName}/${input.folderName}/${input.filename}` };
}
