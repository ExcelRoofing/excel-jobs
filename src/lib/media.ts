import "server-only";
import { randomUUID } from "crypto";
import { addressLine } from "./safe";
import { one, ready, rows, run } from "./db";
import { getBlob } from "./storage";
import { getFile, getJob, getTag, listFiles, listPeopleForMentions } from "./queries";
import { findMentions } from "./mentions";
import { composeBeforeAfter } from "./compose";
import { buildPhotoReport } from "./report-pdf";
import { saveUploadedFile, AppError } from "./services";
import { uploadToDrive } from "./drive";
import { nowIso } from "./time";
import type { Job, Locale, User } from "./types";

const KNOWN: { test: RegExp; lat: number; lng: number }[] = [
  { test: /harbour demo/i, lat: 49.2194, lng: -122.5986 },
  { test: /lumiere demo/i, lat: 49.2261, lng: -122.6012 },
  { test: /panel demo/i, lat: 49.104, lng: -122.659 },
  { test: /rain demo/i, lat: 49.221, lng: -122.69 },
  { test: /wall demo/i, lat: 49.262, lng: -122.781 },
];

export function logActivity(input: { userId: string | null; jobId: string | null; fileId?: string | null; kind: string; summary: string }) {
  run(
    "INSERT INTO activity (id, user_id, job_id, file_id, kind, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    randomUUID(),
    input.userId,
    input.jobId,
    input.fileId || null,
    input.kind,
    input.summary.slice(0, 240),
    nowIso(),
  );
}

export async function placeJob(jobId: string) {
  await ready();
  const job = await getJob(jobId);
  if (!job || (job.latitude != null && job.longitude != null)) return job;
  const query = addressLine(job.address, job.city);
  const known = KNOWN.find((item) => item.test.test(query));
  let lat = known?.lat ?? null;
  let lng = known?.lng ?? null;
  if (lat == null) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${query}, BC, Canada`)}`;
      const response = await fetch(url, { headers: { "User-Agent": "ExcelJobs/0.1 (excelroofing.ca)" }, signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const rowsJson = (await response.json()) as { lat: string; lon: string }[];
        if (rowsJson[0]) {
          lat = Number(rowsJson[0].lat);
          lng = Number(rowsJson[0].lon);
        }
      }
    } catch {
      /* keep the job even when the map service is quiet */
    }
  }
  run("UPDATE jobs SET latitude = ?, longitude = ?, geocoded_at = ? WHERE id = ?", lat, lng, nowIso(), jobId);
  return getJob(jobId);
}

export async function ensurePins(jobs: Job[]) {
  for (const job of jobs) {
    if (job.latitude == null) await placeJob(job.id);
  }
}

export async function searchPhotos(
  user: User,
  filter: { q?: string; tagId?: string; userId?: string; jobId?: string; from?: string; to?: string; starred?: boolean },
) {
  await ready();
  const where = ["f.kind IN ('photo','video','comparison','markup')"];
  const params: (string | number | null)[] = [];
  if (user.role === "crew") {
    where.push("f.job_id IN (SELECT job_id FROM job_members WHERE user_id = ?)");
    params.push(user.id);
  }
  if (filter.tagId) {
    where.push("(f.tag_id = ? OR EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = f.id AND ft.tag_id = ?))");
    params.push(filter.tagId, filter.tagId);
  }
  if (filter.userId) {
    where.push("f.uploaded_by = ?");
    params.push(filter.userId);
  }
  if (filter.jobId) {
    where.push("f.job_id = ?");
    params.push(filter.jobId);
  }
  if (filter.from) {
    where.push("COALESCE(f.taken_at, f.created_at) >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("COALESCE(f.taken_at, f.created_at) <= ?");
    params.push(`${filter.to}T23:59:59`);
  }
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_]/g, "")}%`;
    where.push("(IFNULL(f.note,'') LIKE ? OR j.name LIKE ? OR IFNULL(j.address,'') LIKE ?)");
    params.push(like, like, like);
  }
  if (filter.starred) {
    where.push("EXISTS (SELECT 1 FROM file_stars s WHERE s.file_id = f.id AND s.user_id = ?)");
    params.push(user.id);
  }
  return rows(
    `SELECT f.*, t.slug AS tag_slug, t.name_en AS tag_name_en, t.name_fr AS tag_name_fr, u.name AS uploader_name,
            j.name AS job_name,
            EXISTS (SELECT 1 FROM file_stars s WHERE s.file_id = f.id AND s.user_id = ?) AS starred
     FROM files f
     JOIN jobs j ON j.id = f.job_id
     LEFT JOIN tags t ON t.id = f.tag_id
     LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(f.taken_at, f.created_at) DESC
     LIMIT 200`,
    user.id,
    ...params,
  );
}

export async function toggleStar(userId: string, fileId: string) {
  await ready();
  const existing = one("SELECT 1 AS ok FROM file_stars WHERE user_id = ? AND file_id = ?", userId, fileId);
  if (existing) run("DELETE FROM file_stars WHERE user_id = ? AND file_id = ?", userId, fileId);
  else run("INSERT INTO file_stars (user_id, file_id, created_at) VALUES (?, ?, ?)", userId, fileId, nowIso());
  return !existing;
}

export async function addComment(input: { fileId: string; user: User | null; guestName?: string; body: string }) {
  await ready();
  const body = input.body.trim();
  if (!body) throw new AppError("empty_message");
  const file = await getFile(input.fileId);
  if (!file) throw new AppError("not_found", 404);
  const people = await listPeopleForMentions(file.jobId);
  const mentions = input.user ? findMentions(body, people).filter((id) => id !== input.user?.id) : [];
  const id = randomUUID();
  run(
    "INSERT INTO file_comments (id, file_id, user_id, guest_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    input.fileId,
    input.user?.id || null,
    input.guestName || null,
    body,
    nowIso(),
  );
  for (const userId of mentions) run("INSERT INTO file_comment_mentions (comment_id, user_id) VALUES (?, ?)", id, userId);
  logActivity({
    userId: input.user?.id || null,
    jobId: file.jobId,
    fileId: file.id,
    kind: "comment",
    summary: `${input.user?.name || input.guestName || "Guest"}: ${body.slice(0, 120)}`,
  });
  return id;
}

export async function listComments(fileId: string) {
  await ready();
  return rows(
    `SELECT c.*, u.name AS user_name FROM file_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.file_id = ? ORDER BY c.created_at`,
    fileId,
  );
}

export async function bulkFiles(actor: User, action: string, ids: string[], extra: { tagId?: string; jobId?: string; customerVisible?: boolean }) {
  await ready();
  if (ids.length === 0) throw new AppError("file_missing");
  if (action === "delete") {
    for (const id of ids) {
      const file = await getFile(id);
      if (!file) continue;
      const { deleteFile } = await import("./services");
      await deleteFile(actor, file);
    }
    return;
  }
  if (action === "tag" && extra.tagId) {
    const tag = await getTag(extra.tagId);
    if (!tag) throw new AppError("tag_required");
    for (const id of ids) {
      run("UPDATE files SET tag_id = ? WHERE id = ?", extra.tagId, id);
      run("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)", id, extra.tagId);
    }
    return;
  }
  if (action === "move" && extra.jobId) {
    for (const id of ids) run("UPDATE files SET job_id = ? WHERE id = ?", extra.jobId, id);
    return;
  }
  if (action === "visible") {
    const flag = extra.customerVisible ? 1 : 0;
    for (const id of ids) run("UPDATE files SET customer_visible = ? WHERE id = ?", flag, id);
  }
}

export async function makeComparison(actor: User, job: Job, beforeId: string, afterId: string, locale: Locale) {
  await ready();
  const before = await getFile(beforeId);
  const after = await getFile(afterId);
  if (!before || !after || before.jobId !== job.id || after.jobId !== job.id) throw new AppError("not_found", 404);
  const bytes = composeBeforeAfter(
    await getBlob(before.id),
    before.mime,
    await getBlob(after.id),
    after.mime,
    locale === "fr" ? ["AVANT", "APRES"] : ["BEFORE", "AFTER"],
  );
  const tag = one("SELECT id FROM tags WHERE slug = 'before-after'");
  return saveUploadedFile({
    actor,
    job,
    kind: "comparison",
    bytes,
    filename: "before-after.png",
    mime: "image/png",
    tagId: tag ? String(tag.id) : null,
    note: locale === "fr" ? "Avant et après" : "Before and after",
    derivedFromId: before.id,
    notify: false,
  });
}

export async function makeReport(actor: User, job: Job, title: string, fileIds: string[], locale: Locale) {
  await ready();
  const lines = [];
  for (const id of fileIds) {
    const file = await getFile(id);
    if (!file || file.jobId !== job.id || !file.mime.startsWith("image/")) continue;
    lines.push({
      bytes: await getBlob(file.id),
      mime: file.mime,
      caption: file.note || file.tagNameEn || (locale === "fr" ? "Photo" : "Photo"),
      meta: `${file.uploaderName || ""}  ${file.takenAt || file.createdAt}`.trim(),
    });
  }
  if (lines.length === 0) throw new AppError("file_missing");
  const pdf = await buildPhotoReport({
    title: title || (locale === "fr" ? "Rapport photos" : "Photo report"),
    jobName: job.name,
    address: addressLine(job.address, job.city),
    customer: job.customerName,
    lines,
  });
  const saved = await saveUploadedFile({
    actor,
    job,
    kind: "report",
    bytes: pdf,
    filename: `${title || "photo-report"}.pdf`.replace(/[^\w.\- ]+/g, ""),
    mime: "application/pdf",
    note: title,
    customerVisible: false,
    notify: false,
  });
  run(
    "INSERT INTO reports (id, job_id, type, status, storage_key, created_by, created_at) VALUES (?, ?, 'photo', 'ready', ?, ?, ?)",
    randomUUID(),
    job.id,
    saved.id,
    actor.id,
    nowIso(),
  );
  logActivity({ userId: actor.id, jobId: job.id, fileId: saved.id, kind: "report", summary: `${actor.name}: ${title}` });
  return saved;
}

export async function listTemplates() {
  await ready();
  return rows("SELECT * FROM checklist_templates ORDER BY name_en");
}

export async function applyTemplate(actor: User, job: Job, templateId: string, locale: Locale) {
  await ready();
  const template = one("SELECT * FROM checklist_templates WHERE id = ?", templateId);
  if (!template) throw new AppError("not_found", 404);
  const items = rows("SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY sort", templateId);
  const id = randomUUID();
  const name = locale === "fr" ? String(template.name_fr) : String(template.name_en);
  const now = nowIso();
  run("INSERT INTO checklists (id, job_id, template_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, job.id, templateId, name, actor.id, now);
  for (const item of items) {
    run(
      "INSERT INTO checklist_items (id, checklist_id, sort, title, instructions, photo_required) VALUES (?, ?, ?, ?, ?, ?)",
      randomUUID(),
      id,
      Number(item.sort),
      locale === "fr" ? String(item.title_fr) : String(item.title_en),
      item.instructions_en || item.instructions_fr ? String(locale === "fr" ? item.instructions_fr || "" : item.instructions_en || "") : null,
      Number(item.photo_required),
    );
  }
  return id;
}

export async function listChecklists(jobId: string) {
  await ready();
  const lists = rows("SELECT * FROM checklists WHERE job_id = ? ORDER BY created_at DESC", jobId);
  return lists.map((list) => ({
    ...list,
    items: rows("SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY sort", String(list.id)),
  }));
}

export async function completeChecklistItem(actor: User, itemId: string, fileId: string | null) {
  await ready();
  const item = one("SELECT * FROM checklist_items WHERE id = ?", itemId);
  if (!item) throw new AppError("not_found", 404);
  if (Number(item.photo_required) === 1 && !fileId) throw new AppError("tag_required");
  if (fileId) {
    const file = await getFile(fileId);
    if (!file) throw new AppError("not_found", 404);
    run("INSERT OR IGNORE INTO checklist_item_files (item_id, file_id) VALUES (?, ?)", itemId, fileId);
  }
  run("UPDATE checklist_items SET completed_at = ?, completed_by = ? WHERE id = ?", nowIso(), actor.id, itemId);
  const list = one("SELECT job_id, name FROM checklists WHERE id = ?", String(item.checklist_id));
  logActivity({
    userId: actor.id,
    jobId: list ? String(list.job_id) : null,
    fileId,
    kind: "checklist",
    summary: `${actor.name}: ${String(item.title)}`,
  });
}

export async function saveChecklistTemplate(actor: User, checklistId: string, nameEn: string, nameFr: string) {
  await ready();
  const items = rows("SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY sort", checklistId);
  if (!nameEn || !nameFr) throw new AppError("tag_names");
  const id = randomUUID();
  run("INSERT INTO checklist_templates (id, name_en, name_fr, created_by, created_at) VALUES (?, ?, ?, ?, ?)", id, nameEn, nameFr, actor.id, nowIso());
  items.forEach((item, index) => {
    run(
      "INSERT INTO checklist_template_items (id, template_id, sort, title_en, title_fr, instructions_en, instructions_fr, photo_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      randomUUID(),
      id,
      index + 1,
      String(item.title),
      String(item.title),
      item.instructions ? String(item.instructions) : null,
      item.instructions ? String(item.instructions) : null,
      Number(item.photo_required),
    );
  });
  return id;
}

export async function listActivity(user: User) {
  await ready();
  const where = user.role === "crew" ? "AND (a.job_id IN (SELECT job_id FROM job_members WHERE user_id = ?) OR a.job_id IS NULL)" : "";
  const params = user.role === "crew" ? [user.id] : [];
  return rows(
    `SELECT a.*, u.name AS user_name, j.name AS job_name
     FROM activity a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN jobs j ON j.id = a.job_id
     WHERE 1=1 ${where}
     ORDER BY a.created_at DESC LIMIT 80`,
    ...params,
  );
}

export async function jobFeed(jobId: string) {
  await ready();
  const photos = await listFiles(jobId);
  const comments = rows(
    `SELECT c.id, c.body, c.created_at, c.file_id, COALESCE(u.name, c.guest_name, 'Guest') AS name
     FROM file_comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.file_id IN (SELECT id FROM files WHERE job_id = ?)`,
    jobId,
  );
  const checks = rows(
    `SELECT i.id, i.title, i.completed_at, u.name AS name
     FROM checklist_items i
     JOIN checklists c ON c.id = i.checklist_id
     LEFT JOIN users u ON u.id = i.completed_by
     WHERE c.job_id = ? AND i.completed_at IS NOT NULL`,
    jobId,
  );
  const events = [
    ...photos.map((file) => ({ id: file.id, at: file.takenAt || file.createdAt, kind: file.kind, title: file.note || file.filename, who: file.uploaderName, href: `/jobs/${jobId}/photos/${file.id}` })),
    ...comments.map((row) => ({ id: String(row.id), at: String(row.created_at), kind: "comment", title: String(row.body), who: String(row.name), href: `/jobs/${jobId}/photos/${row.file_id}` })),
    ...checks.map((row) => ({ id: String(row.id), at: String(row.completed_at), kind: "checklist", title: String(row.title), who: row.name ? String(row.name) : "", href: `/jobs/${jobId}/checklists` })),
  ];
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

export async function syncPendingDrive(actor: User) {
  await ready();
  if (actor.role !== "admin") throw new AppError("forbidden", 403);
  const pending = rows("SELECT id, job_id FROM files WHERE drive_synced_at IS NULL LIMIT 40");
  let copied = 0;
  for (const row of pending) {
    const file = await getFile(String(row.id));
    const job = file ? await getJob(file.jobId) : null;
    if (!file || !job) continue;
    try {
      const bytes = await getBlob(file.id);
      const folder = file.kind === "photo" ? file.tagNameEn || "Untagged" : file.kind === "document" ? "Documents" : file.kind;
      const uploaded = await uploadToDrive({
        jobName: job.name,
        folderName: folder,
        filename: `${file.id.slice(0, 8)}-${file.filename}`,
        mime: file.mime,
        bytes,
      });
      if (uploaded) {
        run("UPDATE files SET drive_file_id = ?, drive_path = ?, drive_synced_at = ?, drive_error = NULL WHERE id = ?", uploaded.fileId, uploaded.path, nowIso(), file.id);
        copied += 1;
      }
    } catch (error) {
      run("UPDATE files SET drive_error = ? WHERE id = ?", error instanceof Error ? error.message.slice(0, 200) : "drive", file.id);
    }
  }
  return { copied, left: pending.length - copied };
}

export async function filesForShare(shareId: string) {
  await ready();
  const ids = rows("SELECT file_id FROM share_items WHERE share_id = ?", shareId).map((row) => String(row.file_id));
  const files = [];
  for (const id of ids) {
    const file = await getFile(id);
    if (file) files.push(file);
  }
  return files;
}

export async function listLabels() {
  await ready();
  return rows("SELECT * FROM labels ORDER BY sort, name_en");
}

export async function toggleJobLabel(jobId: string, labelId: string) {
  await ready();
  const existing = one("SELECT 1 AS ok FROM job_labels WHERE job_id = ? AND label_id = ?", jobId, labelId);
  if (existing) run("DELETE FROM job_labels WHERE job_id = ? AND label_id = ?", jobId, labelId);
  else run("INSERT INTO job_labels (job_id, label_id) VALUES (?, ?)", jobId, labelId);
}
