import { readFile } from "fs/promises";
import { baseMime } from "./filing.ts";

export const JOBS_MAX_BYTES = 20 * 1024 * 1024;

const PHOTO = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DOCS = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export class JobsError extends Error {
  status: number;
  permanent: boolean;
  constructor(message: string, status: number, permanent: boolean) {
    super(message);
    this.name = "JobsError";
    this.status = status;
    this.permanent = permanent;
  }
}

export type JobsPush = {
  jobId: string;
  filename: string;
  mime: string;
  filePath: string;
  note: string;
  takenAt: string;
  clientId: string;
  kind: "photo" | "document" | "chat";
  tagSlug: string | null;
};

export type JobsClient = {
  push(input: JobsPush): Promise<{ fileId: string }>;
};

export function planJobsPush(input: {
  mapped: boolean;
  mime: string;
  filename: string | null;
  bytes: number;
  tagSlug: string | null;
  defaultTag: string | null;
  maxBytes?: number;
}): { action: "skip"; reason: string } | { action: "push"; kind: "photo" | "document" | "chat"; tagSlug: string | null; mime: string } {
  if (!input.mapped) return { action: "skip", reason: "unmapped" };
  const max = input.maxBytes ?? JOBS_MAX_BYTES;
  if (input.bytes > max) return { action: "skip", reason: "too_large" };
  const mime = baseMime(input.mime, input.filename);
  if (PHOTO.has(mime)) {
    const tag = input.tagSlug || input.defaultTag;
    if (tag) return { action: "push", kind: "photo", tagSlug: tag, mime };
    return { action: "push", kind: "chat", tagSlug: null, mime };
  }
  if (DOCS.has(mime)) return { action: "push", kind: "document", tagSlug: input.tagSlug, mime };
  return { action: "skip", reason: "unsupported" };
}

type FetchLike = typeof fetch;

export function createHttpJobs(opts: { url: string; email: string; password: string; fetch?: FetchLike }): JobsClient {
  const doFetch = opts.fetch || fetch;
  const base = opts.url.replace(/\/$/, "");
  let cookie = "";
  let tags: Map<string, string> | null = null;

  async function login(): Promise<void> {
    const response = await doFetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: opts.email, password: opts.password }),
    });
    if (!response.ok) throw new JobsError(`Excel Jobs login failed (${response.status})`, response.status, response.status === 401 || response.status === 400);
    const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    const raw = setCookies.find((item) => item.startsWith("ej_session="));
    if (!raw) throw new JobsError("Excel Jobs login did not return a session cookie", 500, false);
    cookie = raw.split(";")[0] || "";
    tags = null;
  }

  async function authed(url: string, init: RequestInit, retry = true): Promise<Response> {
    if (!cookie) await login();
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    headers.set("accept", "application/json");
    headers.set("x-excel-json", "1");
    const response = await doFetch(url, { ...init, headers });
    if (response.status === 401 && retry) {
      cookie = "";
      await login();
      return authed(url, init, false);
    }
    return response;
  }

  async function tagId(slug: string): Promise<string | null> {
    if (!tags) {
      const response = await authed(`${base}/api/tags`, {});
      if (!response.ok) throw new JobsError(`Could not read tags (${response.status})`, response.status, response.status === 403);
      const body = (await response.json()) as { tags?: { id: string; slug: string }[] };
      tags = new Map();
      for (const tag of body.tags || []) tags.set(tag.slug, tag.id);
    }
    return tags.get(slug) || null;
  }

  return {
    async push(input) {
      let tag = "";
      if (input.tagSlug) {
        const id = await tagId(input.tagSlug);
        if (!id) throw new JobsError(`Excel Jobs has no tag named ${input.tagSlug}`, 400, true);
        tag = id;
      } else if (input.kind === "photo") {
        throw new JobsError("A photo needs a tag", 400, true);
      }
      const bytes = await readFile(input.filePath);
      const form = new FormData();
      form.set("file", new File([bytes], input.filename, { type: input.mime }));
      form.set("kind", input.kind);
      form.set("tagId", tag);
      form.set("note", input.note);
      form.set("takenAt", input.takenAt);
      form.set("clientId", input.clientId);
      form.set("customerVisible", "0");
      const response = await authed(`${base}/api/jobs/${encodeURIComponent(input.jobId)}/files`, { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { file?: { id?: string }; error?: string };
      if (!response.ok) {
        const permanent = response.status === 400 || response.status === 403 || response.status === 404 || response.status === 413;
        throw new JobsError(body.error || `Excel Jobs upload failed (${response.status})`, response.status, permanent);
      }
      return { fileId: body.file?.id || "" };
    },
  };
}
