import { createSign } from "crypto";
import { createReadStream, statSync } from "fs";
import { readFile } from "fs/promises";

export class DriveError extends Error {
  status: number;
  retriable: boolean;
  constructor(message: string, status: number, retriable: boolean) {
    super(message);
    this.name = "DriveError";
    this.status = status;
    this.retriable = retriable;
  }
}

export type DriveClient = {
  ensureFolder(parentId: string, name: string): Promise<string>;
  uploadFile(parentId: string, name: string, mime: string, filePath: string): Promise<{ id: string }>;
  updateFile(fileId: string, mime: string, filePath: string): Promise<void>;
};

export type FolderCache = {
  get(key: string): string | null;
  set(key: string, id: string): void;
  forget(key: string): void;
};

export type TokenSource = {
  accessToken(): Promise<string>;
  invalidate(): void;
};

type FetchLike = typeof fetch;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signServiceAccountJwt(email: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  return `${data}.${signer.sign(privateKeyPem).toString("base64url")}`;
}

export function serviceAccountToken(opts: { email: string; privateKey: string; fetch?: FetchLike }): TokenSource {
  const doFetch = opts.fetch || fetch;
  let cache: { value: string; exp: number } | null = null;
  return {
    invalidate() {
      cache = null;
    },
    async accessToken() {
      if (cache && cache.exp > Date.now() + 60_000) return cache.value;
      const assertion = signServiceAccountJwt(opts.email, opts.privateKey);
      const response = await doFetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      });
      if (!response.ok) throw new DriveError(`Google token failed (${response.status})`, response.status, response.status >= 500);
      const json = (await response.json()) as { access_token?: string; expires_in?: number };
      if (!json.access_token) throw new DriveError("Google token response had no access_token", 500, true);
      cache = { value: json.access_token, exp: Date.now() + (json.expires_in || 3600) * 1000 };
      return json.access_token;
    },
  };
}

export function oauthRefreshToken(opts: { clientId: string; clientSecret: string; refreshToken: string; fetch?: FetchLike }): TokenSource {
  const doFetch = opts.fetch || fetch;
  let cache: { value: string; exp: number } | null = null;
  return {
    invalidate() {
      cache = null;
    },
    async accessToken() {
      if (cache && cache.exp > Date.now() + 60_000) return cache.value;
      const response = await doFetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
          refresh_token: opts.refreshToken,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
      if (!response.ok || !json.access_token) {
        throw new DriveError(`Google refresh failed (${response.status} ${json.error || ""})`.trim(), response.status, response.status >= 500 || response.status === 429);
      }
      cache = { value: json.access_token, exp: Date.now() + (json.expires_in || 3600) * 1000 };
      return json.access_token;
    },
  };
}

function quote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function hintForDriveFailure(status: number, body: string): string {
  const quota = /quota|storageQuotaExceeded|do not have storage quota/i.test(body);
  if (quota) {
    return "Google refused the upload because this login has no Drive space. A service account cannot store files in a normal personal Drive. Use the OAuth steps in the README, or put the folder in a Shared Drive and add the service account as a member.";
  }
  if (status === 401 || status === 403) return `Drive refused the upload (${status}). ${body.slice(0, 240)}`;
  return `Drive error (${status}). ${body.slice(0, 240)}`;
}

async function errorFrom(response: Response): Promise<DriveError> {
  const body = await response.text().catch(() => "");
  const retriable = response.status === 429 || response.status >= 500 || response.status === 401;
  return new DriveError(hintForDriveFailure(response.status, body), response.status, retriable);
}

export function createGoogleDrive(opts: {
  fetch?: FetchLike;
  token: TokenSource;
  folders: FolderCache;
  multipartMaxBytes?: number;
}): DriveClient {
  const doFetch = opts.fetch || fetch;
  const multipartMax = opts.multipartMaxBytes ?? 5 * 1024 * 1024;

  async function authed(url: string, init: RequestInit, retry = true): Promise<Response> {
    const token = await opts.token.accessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await doFetch(url, { ...init, headers });
    if (response.status === 401 && retry) {
      opts.token.invalidate();
      return authed(url, init, false);
    }
    return response;
  }

  return {
    async ensureFolder(parentId: string, name: string) {
      const cacheKey = `${parentId}/${name}`;
      const cached = opts.folders.get(cacheKey);
      if (cached) return cached;
      const q = `name = '${quote(name)}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
      const found = await authed(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        {},
      );
      if (!found.ok) throw await errorFrom(found);
      const listed = (await found.json()) as { files?: { id: string }[] };
      let id = listed.files?.[0]?.id;
      if (!id) {
        const created = await authed("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
        });
        if (!created.ok) throw await errorFrom(created);
        id = ((await created.json()) as { id: string }).id;
      }
      opts.folders.set(cacheKey, id);
      return id;
    },

    async uploadFile(parentId, name, mime, filePath) {
      const size = statSync(filePath).size;
      if (size <= multipartMax) return uploadMultipart(authed, parentId, name, mime, filePath);
      return uploadResumable(authed, parentId, name, mime, filePath, size);
    },

    async updateFile(fileId, mime, filePath) {
      const bytes = await readFile(filePath);
      const response = await authed(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`,
        { method: "PATCH", headers: { "Content-Type": mime }, body: bytes },
      );
      if (!response.ok) throw await errorFrom(response);
    },
  };
}

async function uploadMultipart(
  authed: (url: string, init: RequestInit) => Promise<Response>,
  parentId: string,
  name: string,
  mime: string,
  filePath: string,
): Promise<{ id: string }> {
  const boundary = `wb${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const meta = Buffer.from(JSON.stringify({ name, parents: [parentId] }));
  const file = await readFile(filePath);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    meta,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await authed("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw await errorFrom(response);
  const json = (await response.json()) as { id: string };
  return { id: json.id };
}

async function uploadResumable(
  authed: (url: string, init: RequestInit) => Promise<Response>,
  parentId: string,
  name: string,
  mime: string,
  filePath: string,
  size: number,
): Promise<{ id: string }> {
  const start = await authed("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime,
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  if (!start.ok) throw await errorFrom(start);
  const location = start.headers.get("location");
  if (!location) throw new DriveError("Drive did not return an upload link", 500, true);
  const put = await authed(location, {
    method: "PUT",
    duplex: "half",
    headers: { "Content-Type": mime, "Content-Length": String(size) },
    body: createReadStream(filePath) as unknown as BodyInit,
  } as RequestInit);
  if (!put.ok) throw await errorFrom(put);
  const json = (await put.json()) as { id: string };
  return { id: json.id };
}

export type MemoryFile = {
  id: string;
  parentId: string;
  name: string;
  mime: string;
  bytes: Buffer;
  path: string;
};

export function createMemoryDrive(rootId = "root") {
  const folders = new Map<string, string>();
  const folderPath = new Map<string, string>();
  folderPath.set(rootId, "");
  const files: MemoryFile[] = [];
  let n = 1;
  const drive: DriveClient = {
    async ensureFolder(parentId, name) {
      const key = `${parentId}\0${name}`;
      const existing = folders.get(key);
      if (existing) return existing;
      const id = `fld_${n++}`;
      folders.set(key, id);
      const parent = folderPath.get(parentId) || "";
      folderPath.set(id, parent ? `${parent}/${name}` : name);
      return id;
    },
    async uploadFile(parentId, name, mime, filePath) {
      const id = `fil_${n++}`;
      const parent = folderPath.get(parentId) || "";
      const bytes = await readFile(filePath);
      files.push({ id, parentId, name, mime, bytes, path: parent ? `${parent}/${name}` : name });
      return { id };
    },
    async updateFile(fileId, mime, filePath) {
      const found = files.find((file) => file.id === fileId);
      if (!found) throw new DriveError("Drive file is gone", 404, false);
      found.bytes = await readFile(filePath);
      found.mime = mime;
    },
  };
  return { drive, files };
}

export function createFlakyDrive(inner: DriveClient, failTimes: number): { drive: DriveClient; failures: () => number } {
  let left = failTimes;
  let failures = 0;
  return {
    failures: () => failures,
    drive: {
      ensureFolder: (parent, name) => inner.ensureFolder(parent, name),
      async uploadFile(parent, name, mime, filePath) {
        if (left > 0) {
          left -= 1;
          failures += 1;
          throw new DriveError("network down", 503, true);
        }
        return inner.uploadFile(parent, name, mime, filePath);
      },
      updateFile: (id, mime, filePath) => inner.updateFile(id, mime, filePath),
    },
  };
}
