import "server-only";
import { randomUUID } from "crypto";
import { canAdmin, canManage, isDivision, isRole, isStatus } from "./constants";
import { one, ready, rows, run, tx } from "./db";
import { uploadToDrive } from "./drive";
import { findMentions } from "./mentions";
import { dictionary, translate } from "./i18n/translate";
import { newSecret } from "./password";
import { sendPush } from "./push";
import { publish } from "./hub";
import {
  getFile,
  getFileByClientId,
  getJob,
  getMessage,
  getMessageByClientId,
  getTag,
  getUser,
  listPeopleForMentions,
  touchJob,
} from "./queries";
import { excerpt, safeSegment } from "./safe";
import { deleteBlob, getBlob, putBlob, removeLibrary, writeLibrary } from "./storage";
import type { FileKind, Job, JobFile, Role, User } from "./types";
import { nowIso } from "./time";

export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const PHOTO = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const DOCS = new Set([
  ...PHOTO,
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function normalizeMime(filename: string, mime: string) {
  const lower = (mime || "").toLowerCase();
  if (lower && lower !== "application/octet-stream") return lower;
  const ext = filename.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || lower || "application/octet-stream";
}

export function libraryRelative(job: { id: string; name: string }, folder: string, fileId: string, filename: string) {
  const jobFolder = `${safeSegment(job.name, "job")} (${job.id.slice(0, 8)})`;
  const tagFolder = safeSegment(folder, "Untagged");
  const base = safeSegment(filename, "file");
  return `${jobFolder}/${tagFolder}/${fileId.slice(0, 8)}-${base}`;
}

export function folderFor(kind: FileKind, tagNameEn: string | null) {
  if (kind === "document") return "Documents";
  if (kind === "chat") return "Chat";
  if (kind === "video") return "Videos";
  if (kind === "comparison") return "Before and After";
  if (kind === "markup") return "Markup";
  if (kind === "report") return "Reports";
  return tagNameEn || "Untagged";
}

function assertManager(user: User) {
  if (!canManage(user.role)) throw new AppError("forbidden", 403);
}

export async function createJob(
  actor: User,
  input: {
    name: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    address: string;
    city?: string;
    division: string;
    status?: string;
    notes?: string;
    crewIds?: string[];
  },
) {
  await ready();
  assertManager(actor);
  const name = input.name.trim();
  const customerName = input.customerName.trim();
  const address = input.address.trim();
  if (!name) throw new AppError("name_required");
  if (!customerName) throw new AppError("customer_required");
  if (!address) throw new AppError("address_required");
  if (!isDivision(input.division)) throw new AppError("division_required");
  const status = input.status && isStatus(input.status) ? input.status : "lead";
  const id = randomUUID();
  const now = nowIso();
  const email = input.customerEmail?.trim().toLowerCase() || null;
  if (email && !email.includes("@")) throw new AppError("invalid_email");
  tx(() => {
    run(
      `INSERT INTO jobs (id, name, customer_name, customer_email, customer_phone, address, city, division, status, notes, created_by, created_at, updated_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      id,
      name,
      customerName,
      email,
      input.customerPhone?.trim() || null,
      address,
      input.city?.trim() || null,
      input.division,
      status,
      input.notes?.trim() || null,
      actor.id,
      now,
      now,
    );
    for (const crewId of input.crewIds || []) {
      if (!crewId) continue;
      run("INSERT OR IGNORE INTO job_members (job_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)", id, crewId, actor.id, now);
      run(
        `INSERT INTO read_cursors (user_id, job_id, last_read_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id, job_id) DO NOTHING`,
        crewId,
        id,
        now,
      );
    }
  });
  const job = await getJob(id);
  if (!job) throw new AppError("server_error", 500);
  const { placeJob } = await import("./media");
  await placeJob(job.id);
  for (const crewId of input.crewIds || []) {
    if (crewId && crewId !== actor.id) await notifyAdded(crewId, job);
  }
  return job;
}

export async function updateJob(
  actor: User,
  job: Job,
  patch: Partial<{
    name: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    address: string;
    city: string;
    division: string;
    status: string;
    notes: string;
  }>,
) {
  await ready();
  assertManager(actor);
  const next = {
    name: patch.name !== undefined ? patch.name.trim() : job.name,
    customerName: patch.customerName !== undefined ? patch.customerName.trim() : job.customerName,
    customerEmail: patch.customerEmail !== undefined ? patch.customerEmail.trim().toLowerCase() : job.customerEmail,
    customerPhone: patch.customerPhone !== undefined ? patch.customerPhone.trim() : job.customerPhone,
    address: patch.address !== undefined ? patch.address.trim() : job.address,
    city: patch.city !== undefined ? patch.city.trim() : job.city,
    division: patch.division !== undefined ? patch.division : job.division,
    status: patch.status !== undefined ? patch.status : job.status,
    notes: patch.notes !== undefined ? patch.notes.trim() : job.notes,
  };
  if (!next.name) throw new AppError("name_required");
  if (!next.customerName) throw new AppError("customer_required");
  if (!next.address) throw new AppError("address_required");
  if (!isDivision(next.division)) throw new AppError("division_required");
  if (!isStatus(next.status)) throw new AppError("forbidden");
  const now = nowIso();
  run(
    `UPDATE jobs SET name=?, customer_name=?, customer_email=?, customer_phone=?, address=?, city=?, division=?, status=?, notes=?, updated_at=? WHERE id=?`,
    next.name,
    next.customerName,
    next.customerEmail || null,
    next.customerPhone || null,
    next.address,
    next.city || null,
    next.division,
    next.status,
    next.notes || null,
    now,
    job.id,
  );
  if (next.name !== job.name) await relocateJobFiles({ ...job, name: next.name });
  return (await getJob(job.id)) as Job;
}

async function relocateJobFiles(job: Job) {
  const files = rows("SELECT id, filename, kind, library_path, tag_id FROM files WHERE job_id = ?", job.id);
  for (const row of files) {
    const tag = row.tag_id ? await getTag(String(row.tag_id)) : null;
    const folder = folderFor(String(row.kind) as FileKind, tag?.nameEn || null);
    const relative = libraryRelative(job, folder, String(row.id), String(row.filename));
    if (relative === row.library_path) continue;
    try {
      const bytes = await getBlob(String(row.id));
      writeLibrary(relative, bytes);
      removeLibrary(row.library_path ? String(row.library_path) : null);
      run("UPDATE files SET library_path = ? WHERE id = ?", relative, String(row.id));
    } catch {
      /* the blob remains the source of truth */
    }
  }
}

export async function deleteJob(actor: User, job: Job) {
  await ready();
  if (!canAdmin(actor.role)) throw new AppError("forbidden", 403);
  const files = rows("SELECT id, library_path FROM files WHERE job_id = ?", job.id);
  run("DELETE FROM jobs WHERE id = ?", job.id);
  for (const file of files) {
    await deleteBlob(String(file.id)).catch(() => undefined);
    removeLibrary(file.library_path ? String(file.library_path) : null);
  }
}

export async function addMember(actor: User, job: Job, userId: string) {
  await ready();
  assertManager(actor);
  const person = await getUser(userId);
  if (!person || !person.active) throw new AppError("not_found", 404);
  const existing = one("SELECT 1 AS ok FROM job_members WHERE job_id = ? AND user_id = ?", job.id, userId);
  if (existing) throw new AppError("already_member");
  const now = nowIso();
  run("INSERT INTO job_members (job_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)", job.id, userId, actor.id, now);
  run(
    `INSERT INTO read_cursors (user_id, job_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, job_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
    userId,
    job.id,
    now,
  );
  await notifyAdded(userId, job);
}

export async function removeMember(actor: User, job: Job, userId: string) {
  await ready();
  const self = actor.id === userId;
  if (!self) assertManager(actor);
  if (self && canManage(actor.role)) throw new AppError("forbidden", 403);
  run("DELETE FROM job_members WHERE job_id = ? AND user_id = ?", job.id, userId);
}

async function notifyAdded(userId: string, job: Job) {
  const person = await getUser(userId);
  if (!person) return;
  const dict = dictionary(person.locale);
  const title = translate(dict, "addedTitle");
  const body = translate(dict, "addedBody", { job: job.name });
  const href = `/jobs/${job.id}`;
  const id = randomUUID();
  run(
    "INSERT INTO notifications (id, user_id, job_id, kind, title, body, href, created_at) VALUES (?, ?, ?, 'job', ?, ?, ?, ?)",
    id,
    userId,
    job.id,
    title,
    body,
    href,
    nowIso(),
  );
  await sendPush(userId, { title, body, url: href });
}

export async function saveUploadedFile(opts: {
  actor: User | null;
  job: Job;
  kind: FileKind;
  bytes: Buffer;
  filename: string;
  mime: string;
  tagId?: string | null;
  note?: string | null;
  takenAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracy?: number | null;
  customerVisible?: boolean;
  clientId?: string | null;
  notify?: boolean;
  derivedFromId?: string | null;
  durationSeconds?: number | null;
  extraTagIds?: string[];
}) {
  await ready();
  const mime = normalizeMime(opts.filename, opts.mime);
  const limit = opts.kind === "video" ? 40 * 1024 * 1024 : 20 * 1024 * 1024;
  if (opts.bytes.length > limit) throw new AppError("file_too_large");
  if (opts.clientId) {
    const existing = await getFileByClientId(opts.clientId);
    if (existing) return existing;
  }
  let kind = opts.kind;
  if ((kind === "document" || kind === "report") && !(opts.actor && canManage(opts.actor.role))) throw new AppError("forbidden", 403);
  const imageKind = kind === "photo" || kind === "comparison" || kind === "markup";
  const allowed = kind === "video" ? VIDEO : kind === "document" || kind === "chat" || kind === "report" ? DOCS : PHOTO;
  if (kind === "report" && mime !== "application/pdf") throw new AppError("bad_file");
  if (!allowed.has(mime) && !(kind === "document" && mime === "application/vnd.ms-excel")) throw new AppError("bad_file");
  let tagId = opts.tagId || null;
  let tagName: string | null = null;
  if (kind === "photo") {
    if (!tagId) throw new AppError("tag_required");
    const tag = await getTag(tagId);
    if (!tag || !tag.active) throw new AppError("tag_required");
    tagName = tag.nameEn;
  } else if (tagId) {
    const tag = await getTag(tagId);
    if (!tag) tagId = null;
    else {
      tagName = tag.nameEn;
      if (PHOTO.has(mime) && kind === "chat") kind = "photo";
      else if (!imageKind && !PHOTO.has(mime)) tagName = tag.nameEn;
    }
  }
  const customerVisible = opts.actor && canManage(opts.actor.role) && opts.customerVisible ? 1 : 0;
  const id = randomUUID();
  const now = nowIso();
  const folder = folderFor(kind, tagName);
  const relative = libraryRelative(opts.job, folder, id, opts.filename);
  const safeName = safeSegment(opts.filename, "file");
  run(
    `INSERT INTO files (
      id, job_id, kind, storage_key, filename, mime, size, tag_id, note, taken_at,
      latitude, longitude, gps_accuracy, customer_visible, uploaded_by, created_at, library_path, client_id,
      derived_from_id, duration_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.job.id,
    kind,
    id,
    safeName,
    mime,
    opts.bytes.length,
    tagId,
    opts.note?.trim() || null,
    opts.takenAt || now,
    finite(opts.latitude),
    finite(opts.longitude),
    finite(opts.gpsAccuracy),
    customerVisible,
    opts.actor ? opts.actor.id : null,
    now,
    relative,
    opts.clientId || null,
    opts.derivedFromId || null,
    finite(opts.durationSeconds),
  );
  if (tagId) run("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)", id, tagId);
  for (const extra of opts.extraTagIds || []) {
    if (extra) run("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)", id, extra);
  }
  await putBlob(id, opts.bytes, mime);
  try {
    writeLibrary(relative, opts.bytes);
  } catch {
    /* blob is enough for download and zip */
  }
  touchJob(opts.job.id, now);
  await mirrorDrive(id, opts.job.name, folder, `${id.slice(0, 8)}-${safeName}`, mime, opts.bytes);
  if (opts.actor && opts.notify !== false && (kind === "photo" || kind === "video")) await notifyPhoto(opts.actor, opts.job, tagName || folder);
  const { logActivity } = await import("./media");
  logActivity({
    userId: opts.actor?.id ?? null,
    jobId: opts.job.id,
    fileId: id,
    kind: kind === "video" ? "video" : kind === "comparison" ? "comparison" : kind === "markup" ? "markup" : "photo",
    summary: `${opts.actor?.name || "Guest"}: ${opts.job.name}`,
  });
  return (await getFile(id)) as JobFile;
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function mirrorDrive(fileId: string, jobName: string, folder: string, filename: string, mime: string, bytes: Buffer) {
  try {
    const uploaded = await uploadToDrive({ jobName: safeSegment(jobName, "job"), folderName: folder, filename, mime, bytes });
    if (!uploaded) return;
    run(
      "UPDATE files SET drive_file_id = ?, drive_path = ?, drive_synced_at = ?, drive_error = NULL WHERE id = ?",
      uploaded.fileId,
      uploaded.path,
      nowIso(),
      fileId,
    );
  } catch (error) {
    run("UPDATE files SET drive_error = ? WHERE id = ?", error instanceof Error ? error.message.slice(0, 300) : "drive", fileId);
  }
}

async function notifyPhoto(actor: User, job: Job, tag: string) {
  const people = rows("SELECT id, locale FROM users WHERE active = 1 AND role IN ('admin','office') AND id != ?", actor.id);
  const href = `/jobs/${job.id}/photos`;
  for (const person of people) {
    const locale = person.locale === "fr" ? "fr" : "en";
    const dict = dictionary(locale);
    const title = translate(dict, "photoTitle", { job: job.name });
    const body = translate(dict, "photoLine", { tag });
    run(
      "INSERT INTO notifications (id, user_id, job_id, kind, title, body, href, created_at) VALUES (?, ?, ?, 'photo', ?, ?, ?, ?)",
      randomUUID(),
      String(person.id),
      job.id,
      title,
      body,
      href,
      nowIso(),
    );
    await sendPush(String(person.id), { title, body, url: href });
  }
}

export async function retryDrive(actor: User, file: JobFile, job: Job) {
  await ready();
  if (!canAdmin(actor.role)) throw new AppError("forbidden", 403);
  const bytes = await getBlob(file.id);
  const folder = folderFor(file.kind, file.tagNameEn);
  await mirrorDrive(file.id, job.name, folder, `${file.id.slice(0, 8)}-${file.filename}`, file.mime, bytes);
  return getFile(file.id);
}

export async function updateFileMeta(
  actor: User,
  file: JobFile,
  job: Job,
  patch: { tagId?: string | null; note?: string | null; customerVisible?: boolean },
) {
  await ready();
  if (patch.customerVisible !== undefined && !canManage(actor.role)) throw new AppError("forbidden", 403);
  if (patch.tagId !== undefined && !canManage(actor.role)) throw new AppError("forbidden", 403);
  if (patch.note !== undefined && !canManage(actor.role) && file.uploadedBy !== actor.id) throw new AppError("forbidden", 403);
  let tagName = file.tagNameEn;
  let tagId = file.tagId;
  if (patch.tagId !== undefined) {
    if (!patch.tagId) {
      tagId = null;
      tagName = null;
    } else {
      const tag = await getTag(patch.tagId);
      if (!tag) throw new AppError("tag_required");
      tagId = tag.id;
      tagName = tag.nameEn;
    }
  }
  const note = patch.note !== undefined ? (patch.note || "").trim() : file.note;
  const visible = patch.customerVisible !== undefined ? (patch.customerVisible ? 1 : 0) : file.customerVisible ? 1 : 0;
  const kind = file.kind === "chat" && tagId ? "photo" : file.kind === "photo" && !tagId ? "chat" : file.kind;
  const folder = folderFor(kind, tagName);
  const relative = libraryRelative(job, folder, file.id, file.filename);
  run("UPDATE files SET tag_id = ?, note = ?, customer_visible = ?, kind = ?, library_path = ? WHERE id = ?", tagId, note || null, visible, kind, relative, file.id);
  if (relative !== file.libraryPath) {
    try {
      const bytes = await getBlob(file.id);
      writeLibrary(relative, bytes);
      removeLibrary(file.libraryPath);
    } catch {
      /* keep the database path; zip falls back to the blob */
    }
  }
  return (await getFile(file.id)) as JobFile;
}

export async function deleteFile(actor: User, file: JobFile) {
  await ready();
  if (!canManage(actor.role) && file.uploadedBy !== actor.id) throw new AppError("forbidden", 403);
  run("DELETE FROM files WHERE id = ?", file.id);
  await deleteBlob(file.id).catch(() => undefined);
  removeLibrary(file.libraryPath);
}

export async function postMessage(opts: {
  actor: User;
  job: Job;
  body: string;
  clientId?: string | null;
  file?: {
    bytes: Buffer;
    filename: string;
    mime: string;
    tagId?: string | null;
    note?: string | null;
    takenAt?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    gpsAccuracy?: number | null;
  };
}) {
  await ready();
  if (opts.clientId) {
    const existing = await getMessageByClientId(opts.clientId);
    if (existing) return existing;
  }
  const body = opts.body.trim();
  if (!body && !opts.file) throw new AppError("empty_message");
  let saved = null as JobFile | null;
  if (opts.file) {
    const mime = normalizeMime(opts.file.filename, opts.file.mime);
    const image = mime.startsWith("image/");
    saved = await saveUploadedFile({
      actor: opts.actor,
      job: opts.job,
      kind: image && opts.file.tagId ? "photo" : "chat",
      bytes: opts.file.bytes,
      filename: opts.file.filename,
      mime,
      tagId: opts.file.tagId,
      note: opts.file.note,
      takenAt: opts.file.takenAt,
      latitude: opts.file.latitude,
      longitude: opts.file.longitude,
      gpsAccuracy: opts.file.gpsAccuracy,
      notify: false,
    });
  }
  const people = await listPeopleForMentions(opts.job.id);
  const mentionIds = findMentions(body, people).filter((id) => id !== opts.actor.id);
  const id = randomUUID();
  const now = nowIso();
  const text = body || (saved ? saved.filename : "");
  tx(() => {
    run("INSERT INTO messages (id, job_id, user_id, body, created_at, client_id) VALUES (?, ?, ?, ?, ?, ?)", id, opts.job.id, opts.actor.id, text, now, opts.clientId || null);
    if (saved) run("INSERT INTO message_files (message_id, file_id) VALUES (?, ?)", id, saved.id);
    for (const userId of mentionIds) run("INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)", id, userId);
    run("UPDATE jobs SET updated_at = ? WHERE id = ?", now, opts.job.id);
  });
  const message = await getMessage(id);
  if (!message) throw new AppError("server_error", 500);
  publish(`job:${opts.job.id}`, { type: "message", message });
  await notifyMessage(opts.actor, opts.job, message, new Set(mentionIds));
  return message;
}

async function notifyMessage(actor: User, job: Job, message: { id: string; body: string }, mentioned: Set<string>) {
  const recipients = rows(
    `SELECT DISTINCT u.id, u.locale FROM users u
     WHERE u.active = 1 AND u.id != ? AND (u.role IN ('admin','office') OR u.id IN (SELECT user_id FROM job_members WHERE job_id = ?))`,
    actor.id,
    job.id,
  );
  const href = `/jobs/${job.id}/chat`;
  const preview = excerpt(message.body, 140);
  for (const person of recipients) {
    const locale = person.locale === "fr" ? "fr" : "en";
    const dict = dictionary(locale);
    const isMention = mentioned.has(String(person.id));
    const title = translate(dict, isMention ? "mentionTitle" : "messageTitle", { job: job.name });
    const body = translate(dict, "fromLine", { name: actor.name, text: preview || translate(dict, "emptyFile") });
    run(
      "INSERT INTO notifications (id, user_id, job_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      randomUUID(),
      String(person.id),
      job.id,
      isMention ? "mention" : "chat",
      title,
      body,
      href,
      nowIso(),
    );
    await sendPush(String(person.id), { title, body, url: href });
  }
}

export async function createShare(
  actor: User,
  job: Job,
  rotate = false,
  kind: "timeline" | "gallery" | "guest" = "timeline",
  fileIds: string[] = [],
) {
  await ready();
  assertManager(actor);
  const now = nowIso();
  if (rotate) run("UPDATE share_links SET revoked_at = ? WHERE job_id = ? AND kind = ? AND revoked_at IS NULL", now, job.id, kind);
  if (kind !== "gallery") {
    const existing = one("SELECT id, token, created_at FROM share_links WHERE job_id = ? AND kind = ? AND revoked_at IS NULL", job.id, kind);
    if (existing && !rotate) return existing;
  }
  const token = newSecret(32);
  const id = randomUUID();
  run(
    "INSERT INTO share_links (id, job_id, token, created_by, created_at, kind) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    job.id,
    token,
    actor.id,
    now,
    kind,
  );
  for (const fileId of fileIds) run("INSERT OR IGNORE INTO share_items (share_id, file_id) VALUES (?, ?)", id, fileId);
  return { id, token, created_at: now, kind };
}

export async function revokeShare(actor: User, job: Job) {
  await ready();
  assertManager(actor);
  run("UPDATE share_links SET revoked_at = ? WHERE job_id = ? AND revoked_at IS NULL", nowIso(), job.id);
}

export async function createInvite(
  actor: User,
  input: { name?: string; email?: string; phone?: string; role: string; jobId?: string | null },
) {
  await ready();
  assertManager(actor);
  if (!isRole(input.role)) throw new AppError("forbidden");
  if (input.role === "admin" && !canAdmin(actor.role)) throw new AppError("forbidden", 403);
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) throw new AppError("email_or_phone");
  if (email && !email.includes("@")) throw new AppError("invalid_email");
  if (email && one("SELECT id FROM users WHERE lower(email) = ?", email)) throw new AppError("email_taken");
  if (input.jobId && !(await getJob(input.jobId))) throw new AppError("not_found", 404);
  const now = new Date();
  const token = newSecret(32);
  const id = randomUUID();
  run(
    `INSERT INTO invites (id, token, email, phone, name, role, job_id, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    token,
    email,
    phone,
    input.name?.trim() || null,
    input.role,
    input.jobId || null,
    actor.id,
    now.toISOString(),
    new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  );
  return { id, token };
}

export async function cancelInvite(actor: User, inviteId: string) {
  await ready();
  assertManager(actor);
  run("DELETE FROM invites WHERE id = ? AND accepted_at IS NULL", inviteId);
}

export async function acceptInvite(input: { token: string; name: string; passwordHash: string }) {
  await ready();
  const row = one("SELECT * FROM invites WHERE token = ?", input.token);
  if (!row) throw new AppError("invite_invalid", 404);
  if (row.accepted_at) throw new AppError("invite_used");
  if (String(row.expires_at) < nowIso()) throw new AppError("invite_expired");
  const email = row.email ? String(row.email) : null;
  if (email) {
    const existing = one("SELECT id FROM users WHERE lower(email) = ?", email.toLowerCase());
    if (existing) throw new AppError("email_taken");
  }
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("name_too_short");
  const id = randomUUID();
  const now = nowIso();
  tx(() => {
    run(
      `INSERT INTO users (id, name, email, phone, password_hash, role, locale, active, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'en', 1, 0, ?)`,
      id,
      name,
      email,
      row.phone ? String(row.phone) : null,
      input.passwordHash,
      String(row.role),
      now,
    );
    if (row.job_id) {
      run("INSERT OR IGNORE INTO job_members (job_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)", String(row.job_id), id, String(row.created_by), now);
      run("INSERT OR IGNORE INTO read_cursors (user_id, job_id, last_read_at) VALUES (?, ?, ?)", id, String(row.job_id), now);
    }
    run("UPDATE invites SET accepted_at = ?, accepted_user_id = ? WHERE id = ?", now, id, String(row.id));
  });
  return id;
}

export async function setUserRole(actor: User, userId: string, role: Role) {
  await ready();
  if (!canAdmin(actor.role)) throw new AppError("forbidden", 403);
  if (actor.id === userId) throw new AppError("forbidden", 403);
  const target = await getUser(userId);
  if (!target) throw new AppError("not_found", 404);
  if (target.role === "admin" && role !== "admin") {
    const admins = Number(one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")?.n || 0);
    if (admins <= 1) throw new AppError("last_admin");
  }
  run("UPDATE users SET role = ? WHERE id = ?", role, userId);
}

export async function setUserActive(actor: User, userId: string, active: boolean) {
  await ready();
  if (!canAdmin(actor.role)) throw new AppError("forbidden", 403);
  if (actor.id === userId) throw new AppError("cannot_self");
  const target = await getUser(userId);
  if (!target) throw new AppError("not_found", 404);
  if (target.role === "admin" && target.active && !active) {
    const admins = Number(one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")?.n || 0);
    if (admins <= 1) throw new AppError("last_admin");
  }
  run("UPDATE users SET active = ? WHERE id = ?", active ? 1 : 0, userId);
}

export async function setUserLocale(userId: string, locale: "en" | "fr") {
  await ready();
  run("UPDATE users SET locale = ? WHERE id = ?", locale, userId);
}

export function clearDemoFlag(userId: string) {
  run("UPDATE users SET is_demo = 0 WHERE id = ?", userId);
}

export async function saveTag(actor: User, input: { id?: string; nameEn: string; nameFr: string; active?: boolean }) {
  await ready();
  if (!canAdmin(actor.role)) throw new AppError("forbidden", 403);
  const nameEn = input.nameEn.trim();
  const nameFr = input.nameFr.trim();
  if (!nameEn || !nameFr) throw new AppError("tag_names");
  if (input.id) {
    const current = await getTag(input.id);
    if (!current) throw new AppError("not_found", 404);
    run("UPDATE tags SET name_en = ?, name_fr = ?, active = ? WHERE id = ?", nameEn, nameFr, input.active === false ? 0 : 1, input.id);
    if (nameEn !== current.nameEn) {
      const files = rows("SELECT id FROM files WHERE tag_id = ?", input.id);
      for (const fileRow of files) {
        const file = await getFile(String(fileRow.id));
        const job = file ? await getJob(file.jobId) : null;
        if (file && job) await updateFileMeta(actor, file, job, { tagId: file.tagId });
      }
    }
    return getTag(input.id);
  }
  const base = safeSegment(nameEn, "tag").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag";
  let slug = base;
  let i = 2;
  while (one("SELECT id FROM tags WHERE slug = ?", slug)) slug = `${base}-${i++}`;
  const sort = Number(one("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM tags")?.n || 1);
  const id = randomUUID();
  run("INSERT INTO tags (id, name_en, name_fr, slug, sort, active) VALUES (?, ?, ?, ?, ?, 1)", id, nameEn, nameFr, slug, sort);
  return getTag(id);
}

export async function moveTag(actor: User, id: string, direction: "up" | "down") {
  await ready();
  if (!canAdmin(actor.role)) throw new AppError("forbidden", 403);
  const tags = rows("SELECT id, sort FROM tags ORDER BY sort, name_en");
  const index = tags.findIndex((tag) => String(tag.id) === id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= tags.length) return;
  const a = tags[index];
  const b = tags[swap];
  tx(() => {
    run("UPDATE tags SET sort = ? WHERE id = ?", Number(b.sort), String(a.id));
    run("UPDATE tags SET sort = ? WHERE id = ?", Number(a.sort), String(b.id));
  });
}
