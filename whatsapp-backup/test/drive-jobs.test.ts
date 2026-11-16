import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "crypto";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import test from "node:test";
import { createGoogleDrive, oauthRefreshToken, serviceAccountToken, signServiceAccountJwt } from "../src/drive.ts";
import { planJobsPush, createHttpJobs } from "../src/jobs.ts";
import { configFromEnv, assertRunnable } from "../src/config.ts";
import { matchGroup, parseGroupMap } from "../src/group-map.ts";

test("service account token is a signed JWT and Drive creates a missing folder", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwt = signServiceAccountJwt("backup@example.iam.gserviceaccount.com", pem, 1_700_000_000);
  const [header, payload, sig] = jwt.split(".");
  const verify = createVerify("RSA-SHA256");
  verify.update(`${header}.${payload}`);
  verify.end();
  assert.equal(verify.verify(publicKey, Buffer.from(sig, "base64url")), true);
  const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as { iss: string; scope: string };
  assert.equal(body.iss, "backup@example.iam.gserviceaccount.com");
  assert.match(body.scope, /drive/);

  const calls: { url: string; method: string; body?: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET", body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("uploadType=resumable") && (init?.method || "") === "POST") {
      return new Response("{}", { status: 200, headers: { location: "https://upload.example/session" } });
    }
    if (url === "https://upload.example/session") {
      return new Response(JSON.stringify({ id: "file-big" }), { status: 200 });
    }
    if (url.includes("/drive/v3/files") && (init?.method || "GET") === "POST") {
      return new Response(JSON.stringify({ id: "folder-1" }), { status: 200 });
    }
    if (url.includes("/drive/v3/files?")) {
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    return new Response("nope", { status: 500 });
  };

  const token = serviceAccountToken({ email: "backup@example.iam.gserviceaccount.com", privateKey: pem, fetch: fetchImpl });
  const folders = new Map<string, string>();
  const drive = createGoogleDrive({
    fetch: fetchImpl,
    token,
    folders: {
      get: (key) => folders.get(key) || null,
      set: (key, id) => folders.set(key, id),
      forget: (key) => folders.delete(key),
    },
    multipartMaxBytes: 0,
  });
  const folder = await drive.ensureFolder("root", "Chen reroof");
  assert.equal(folder, "folder-1");
  assert.equal(await drive.ensureFolder("root", "Chen reroof"), "folder-1");
  const dir = await mkdtemp(path.join(tmpdir(), "wa-drive-"));
  try {
    const file = path.join(dir, "a.jpg");
    await writeFile(file, Buffer.from("hello-drive"));
    const uploaded = await drive.uploadFile("folder-1", "a.jpg", "image/jpeg", file);
    assert.equal(uploaded.id, "file-big");
    assert.ok(calls.some((call) => call.url.includes("uploadType=resumable")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("oauth refresh and a 401 are retried once", async () => {
  let tokenCalls = 0;
  let fileCalls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) {
      tokenCalls += 1;
      return new Response(JSON.stringify({ access_token: `tok-${tokenCalls}`, expires_in: 3600 }), { status: 200 });
    }
    fileCalls += 1;
    if (fileCalls === 1) return new Response("unauthorized", { status: 401 });
    return new Response(JSON.stringify({ files: [{ id: "have" }] }), { status: 200 });
  };
  const token = oauthRefreshToken({ clientId: "id", clientSecret: "secret", refreshToken: "refresh", fetch: fetchImpl });
  const drive = createGoogleDrive({
    fetch: fetchImpl,
    token,
    folders: { get: () => null, set: () => undefined, forget: () => undefined },
  });
  const id = await drive.ensureFolder("root", "Day");
  assert.equal(id, "have");
  assert.equal(tokenCalls, 2);
});

test("job push rules follow the Excel Jobs file limits", () => {
  assert.deepEqual(planJobsPush({ mapped: false, mime: "image/jpeg", filename: "a.jpg", bytes: 10, tagSlug: "before", defaultTag: null }), {
    action: "skip",
    reason: "unmapped",
  });
  assert.equal(planJobsPush({ mapped: true, mime: "image/jpeg", filename: "a.jpg", bytes: 10, tagSlug: "before", defaultTag: "during" }).action, "push");
  const photo = planJobsPush({ mapped: true, mime: "image/jpeg", filename: "a.jpg", bytes: 10, tagSlug: null, defaultTag: "during" });
  assert.deepEqual(photo, { action: "push", kind: "photo", tagSlug: "during", mime: "image/jpeg" });
  const chat = planJobsPush({ mapped: true, mime: "image/jpeg", filename: "a.jpg", bytes: 10, tagSlug: null, defaultTag: null });
  assert.deepEqual(chat, { action: "push", kind: "chat", tagSlug: null, mime: "image/jpeg" });
  const video = planJobsPush({ mapped: true, mime: "video/mp4", filename: "a.mp4", bytes: 10, tagSlug: "after", defaultTag: null });
  assert.deepEqual(video, { action: "skip", reason: "unsupported" });
  const big = planJobsPush({ mapped: true, mime: "image/jpeg", filename: "a.jpg", bytes: 21 * 1024 * 1024, tagSlug: "before", defaultTag: null });
  assert.deepEqual(big, { action: "skip", reason: "too_large" });
});

test("Excel Jobs client logs in, reads tags, and uploads the file", async () => {
  const seen: { url: string; tag?: string; client?: string; cookie?: string }[] = [];
  let uploads = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.endsWith("/api/auth/login")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "set-cookie": "ej_session=abc; Path=/; HttpOnly" } });
    }
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ tags: [{ id: "tag-before", slug: "before" }] }), { status: 200 });
    }
    uploads += 1;
    if (uploads === 1) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    const form = await new Request(url, init).formData();
    seen.push({
      url,
      tag: String(form.get("tagId")),
      client: String(form.get("clientId")),
      cookie: headers.get("cookie") || "",
    });
    return new Response(JSON.stringify({ file: { id: "f1" } }), { status: 200 });
  };
  const jobs = createHttpJobs({ url: "http://jobs.test", email: "office@example.com", password: "secret", fetch: fetchImpl });
  const dir = await mkdtemp(path.join(tmpdir(), "wa-jobs-"));
  try {
    const file = path.join(dir, "a.jpg");
    await writeFile(file, Buffer.from("pic"));
    const result = await jobs.push({
      jobId: "job 1",
      filename: "a.jpg",
      mime: "image/jpeg",
      filePath: file,
      note: "Avant",
      takenAt: "2026-01-14T23:31:02.000Z",
      clientId: "wa:1",
      kind: "photo",
      tagSlug: "before",
    });
    assert.equal(result.fileId, "f1");
    assert.equal(seen[0]?.tag, "tag-before");
    assert.equal(seen[0]?.client, "wa:1");
    assert.match(seen[0]?.cookie || "", /ej_session=/);
    assert.match(seen[0]?.url || "", /job%201/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("config accepts one Google login and refuses a public admin page with no token", () => {
  const service = configFromEnv({
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "a@b.iam.gserviceaccount.com",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
    GOOGLE_DRIVE_ROOT_FOLDER_ID: "folder",
    HOST: "127.0.0.1",
  });
  assert.equal(service.google?.mode, "service_account");
  if (service.google?.mode === "service_account") assert.match(service.google.privateKey, /\nABC\n/);
  const oauth = configFromEnv({
    GOOGLE_OAUTH_CLIENT_ID: "id",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    GOOGLE_OAUTH_REFRESH_TOKEN: "refresh",
  });
  assert.equal(oauth.google?.mode, "oauth");
  assert.throws(() => assertRunnable(configFromEnv({ HOST: "0.0.0.0" })), /ADMIN_TOKEN/);
  assert.throws(() => configFromEnv({ EXCEL_JOBS_PUSH: "on" }), /EXCEL_JOBS_EMAIL/);
  const map = parseGroupMap(JSON.stringify({ groups: [{ group: "Chen reroof", jobId: "job-1", defaultTag: "during" }, { group: "", jobId: "x" }] }));
  assert.equal(matchGroup(map, "111@g.us", "Chen reroof")?.jobId, "job-1");
  assert.equal(matchGroup(map, "111@g.us", "Other")?.jobId, undefined);
});
