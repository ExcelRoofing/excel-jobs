import "server-only";
import { ready, one, rows, run, tx } from "./db";
import type {
  AppNotification,
  ChatMessage,
  Division,
  FileKind,
  InviteView,
  Job,
  JobFile,
  JobListItem,
  JobStatus,
  Locale,
  Member,
  Role,
  ShareRow,
  Tag,
  User,
} from "./types";

function s(value: unknown) {
  return value == null ? null : String(value);
}
function n(value: unknown) {
  return value == null || value === "" ? null : Number(value);
}
function b(value: unknown) {
  return Number(value) === 1;
}

export function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: s(row.email),
    phone: s(row.phone),
    role: String(row.role) as Role,
    locale: row.locale === "fr" ? "fr" : "en",
    active: b(row.active),
    isDemo: b(row.is_demo),
    createdAt: String(row.created_at),
  };
}

function mapJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    name: String(row.name),
    customerName: String(row.customer_name),
    customerEmail: s(row.customer_email),
    customerPhone: s(row.customer_phone),
    address: String(row.address),
    city: s(row.city),
    division: String(row.division) as Division,
    status: String(row.status) as JobStatus,
    notes: s(row.notes),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    source: String(row.source || "manual"),
    sourceId: s(row.source_id),
    sourceUrl: s(row.source_url),
    sourceSyncedAt: s(row.source_synced_at),
  };
}

function mapTag(row: Record<string, unknown>): Tag {
  return {
    id: String(row.id),
    nameEn: String(row.name_en),
    nameFr: String(row.name_fr),
    slug: String(row.slug),
    sort: Number(row.sort),
    active: b(row.active),
  };
}

function mapFile(row: Record<string, unknown>): JobFile {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    kind: String(row.kind) as FileKind,
    filename: String(row.filename),
    mime: String(row.mime),
    size: Number(row.size),
    tagId: s(row.tag_id),
    tagSlug: s(row.tag_slug),
    tagNameEn: s(row.tag_name_en),
    tagNameFr: s(row.tag_name_fr),
    note: s(row.note),
    takenAt: s(row.taken_at),
    latitude: n(row.latitude),
    longitude: n(row.longitude),
    gpsAccuracy: n(row.gps_accuracy),
    customerVisible: b(row.customer_visible),
    uploadedBy: s(row.uploaded_by),
    uploaderName: s(row.uploader_name),
    createdAt: String(row.created_at),
    libraryPath: s(row.library_path),
    driveFileId: s(row.drive_file_id),
    drivePath: s(row.drive_path),
    driveSyncedAt: s(row.drive_synced_at),
    driveError: s(row.drive_error),
    clientId: s(row.client_id),
  };
}

const FILE_SELECT = `
  SELECT f.*, t.slug AS tag_slug, t.name_en AS tag_name_en, t.name_fr AS tag_name_fr, u.name AS uploader_name
  FROM files f
  LEFT JOIN tags t ON t.id = f.tag_id
  LEFT JOIN users u ON u.id = f.uploaded_by
`;

export async function getUser(id: string) {
  await ready();
  const row = one("SELECT * FROM users WHERE id = ?", id);
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(email: string) {
  await ready();
  const row = one("SELECT * FROM users WHERE lower(email) = ?", email.trim().toLowerCase());
  return row ? { user: mapUser(row), passwordHash: String(row.password_hash) } : null;
}

export async function listUsers() {
  await ready();
  return rows("SELECT * FROM users ORDER BY active DESC, name COLLATE NOCASE").map(mapUser);
}

export async function listDemoUsers() {
  await ready();
  return rows("SELECT * FROM users WHERE is_demo = 1 AND active = 1 ORDER BY name COLLATE NOCASE").map(mapUser);
}

export async function countUsers() {
  await ready();
  return Number(one("SELECT COUNT(*) AS n FROM users")?.n || 0);
}

export function countUsersSync() {
  return Number(one("SELECT COUNT(*) AS n FROM users")?.n || 0);
}

export async function getJob(id: string) {
  await ready();
  const row = one("SELECT * FROM jobs WHERE id = ?", id);
  return row ? mapJob(row) : null;
}

export async function canSeeJob(user: User, jobId: string) {
  await ready();
  if (!one("SELECT id FROM jobs WHERE id = ?", jobId)) return false;
  if (user.role === "admin" || user.role === "office") return true;
  return Boolean(one("SELECT 1 AS ok FROM job_members WHERE job_id = ? AND user_id = ?", jobId, user.id));
}

const UNREAD = `
  (SELECT COUNT(*) FROM messages m
    WHERE m.job_id = j.id AND m.user_id != ?
      AND m.created_at > COALESCE(
        (SELECT last_read_at FROM read_cursors r WHERE r.user_id = ? AND r.job_id = j.id),
        (SELECT created_at FROM users WHERE id = ?)
      ))
`;

export async function listJobs(user: User, filter: { q?: string; division?: string; status?: string }) {
  await ready();
  const where = ["1=1"];
  const params: (string | number | null)[] = [user.id, user.id, user.id];
  if (user.role === "crew") {
    where.push("j.id IN (SELECT job_id FROM job_members WHERE user_id = ?)");
    params.push(user.id);
  }
  if (filter.division) {
    where.push("j.division = ?");
    params.push(filter.division);
  }
  if (filter.status) {
    where.push("j.status = ?");
    params.push(filter.status);
  }
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_]/g, "")}%`;
    where.push("(j.name LIKE ? OR j.customer_name LIKE ? OR j.address LIKE ? OR IFNULL(j.city,'') LIKE ?)");
    params.push(like, like, like, like);
  }
  const list = rows(
    `SELECT j.*,
      ${UNREAD} AS unread,
      (SELECT COUNT(*) FROM files f WHERE f.job_id = j.id AND f.kind = 'photo') AS photo_count,
      (SELECT m.created_at FROM messages m WHERE m.job_id = j.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
      (SELECT m.body FROM messages m WHERE m.job_id = j.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_body,
      (SELECT u.name FROM messages m JOIN users u ON u.id = m.user_id WHERE m.job_id = j.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_name
     FROM jobs j
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(last_message_at, j.updated_at) DESC`,
    ...params,
  );
  return list.map((row) => ({
    ...mapJob(row),
    unread: Number(row.unread || 0),
    photoCount: Number(row.photo_count || 0),
    lastMessageAt: s(row.last_message_at),
    lastMessageBody: s(row.last_message_body),
    lastMessageName: s(row.last_message_name),
  })) as JobListItem[];
}

export async function listMembers(jobId: string) {
  await ready();
  return rows(
    `SELECT u.* FROM users u JOIN job_members m ON m.user_id = u.id WHERE m.job_id = ? ORDER BY u.name COLLATE NOCASE`,
    jobId,
  ).map((row): Member => ({
    id: String(row.id),
    name: String(row.name),
    role: String(row.role) as Role,
    phone: s(row.phone),
    email: s(row.email),
    locale: row.locale === "fr" ? "fr" : "en",
    active: b(row.active),
  }));
}

export async function listPeopleForMentions(jobId: string) {
  await ready();
  return rows(
    `SELECT DISTINCT u.id, u.name, u.role FROM users u
     WHERE u.active = 1 AND (u.role IN ('admin','office') OR u.id IN (SELECT user_id FROM job_members WHERE job_id = ?))
     ORDER BY u.name COLLATE NOCASE`,
    jobId,
  ).map((row) => ({ id: String(row.id), name: String(row.name), role: String(row.role) as Role }));
}

export async function listTags(includeHidden = false) {
  await ready();
  const sql = includeHidden ? "SELECT * FROM tags ORDER BY sort, name_en" : "SELECT * FROM tags WHERE active = 1 ORDER BY sort, name_en";
  return rows(sql).map(mapTag);
}

export async function getTag(id: string) {
  await ready();
  const row = one("SELECT * FROM tags WHERE id = ?", id);
  return row ? mapTag(row) : null;
}

export async function tagUsage(id: string) {
  await ready();
  return Number(one("SELECT COUNT(*) AS n FROM files WHERE tag_id = ?", id)?.n || 0);
}

export async function listFiles(jobId: string, kind?: FileKind) {
  await ready();
  if (kind) return rows(`${FILE_SELECT} WHERE f.job_id = ? AND f.kind = ? ORDER BY COALESCE(f.taken_at, f.created_at) DESC`, jobId, kind).map(mapFile);
  return rows(`${FILE_SELECT} WHERE f.job_id = ? ORDER BY COALESCE(f.taken_at, f.created_at) DESC`, jobId).map(mapFile);
}

export async function getFile(id: string) {
  await ready();
  const row = one(`${FILE_SELECT} WHERE f.id = ?`, id);
  return row ? mapFile(row) : null;
}

export async function getFileByClientId(clientId: string) {
  await ready();
  const row = one(`${FILE_SELECT} WHERE f.client_id = ?`, clientId);
  return row ? mapFile(row) : null;
}

export async function visiblePortalFiles(jobId: string) {
  await ready();
  return rows(
    `${FILE_SELECT} WHERE f.job_id = ? AND f.customer_visible = 1 AND f.kind IN ('photo','document') ORDER BY COALESCE(f.taken_at, f.created_at) DESC`,
    jobId,
  ).map(mapFile);
}

function attachFiles(messages: ChatMessage[]) {
  if (messages.length === 0) return messages;
  const ids = messages.map((message) => message.id);
  const placeholders = ids.map(() => "?").join(",");
  const links = rows(
    `SELECT mf.message_id, f.*, t.slug AS tag_slug, t.name_en AS tag_name_en, t.name_fr AS tag_name_fr, u.name AS uploader_name
     FROM message_files mf
     JOIN files f ON f.id = mf.file_id
     LEFT JOIN tags t ON t.id = f.tag_id
     LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE mf.message_id IN (${placeholders})`,
    ...ids,
  );
  const mentions = rows(`SELECT message_id, user_id FROM message_mentions WHERE message_id IN (${placeholders})`, ...ids);
  for (const message of messages) {
    message.files = links.filter((row) => String(row.message_id) === message.id).map(mapFile);
    message.mentionIds = mentions.filter((row) => String(row.message_id) === message.id).map((row) => String(row.user_id));
  }
  return messages;
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    userId: String(row.user_id),
    userName: String(row.user_name || "Someone"),
    userRole: (String(row.user_role || "crew") as Role),
    body: String(row.body || ""),
    createdAt: String(row.created_at),
    mentionIds: [],
    files: [],
  };
}

const MESSAGE_SELECT = `
  SELECT m.*, u.name AS user_name, u.role AS user_role
  FROM messages m JOIN users u ON u.id = m.user_id
`;

export async function listMessages(jobId: string, opts: { before?: string; after?: string; limit?: number } = {}) {
  await ready();
  const limit = opts.limit ?? 200;
  if (opts.after) {
    const list = rows(
      `${MESSAGE_SELECT} WHERE m.job_id = ? AND m.created_at >= ? ORDER BY m.created_at ASC LIMIT ?`,
      jobId,
      opts.after,
      limit,
    ).map(mapMessage);
    return { messages: attachFiles(list), hasOlder: false };
  }
  const params: (string | number | null)[] = [jobId];
  let where = "m.job_id = ?";
  if (opts.before) {
    where += " AND m.created_at < ?";
    params.push(opts.before);
  }
  params.push(limit + 1);
  const found = rows(`${MESSAGE_SELECT} WHERE ${where} ORDER BY m.created_at DESC LIMIT ?`, ...params).map(mapMessage);
  const hasOlder = found.length > limit;
  const slice = found.slice(0, limit).reverse();
  return { messages: attachFiles(slice), hasOlder };
}

export async function getMessage(id: string) {
  await ready();
  const row = one(`${MESSAGE_SELECT} WHERE m.id = ?`, id);
  if (!row) return null;
  return attachFiles([mapMessage(row)])[0];
}

export async function getMessageByClientId(clientId: string) {
  await ready();
  const row = one(`${MESSAGE_SELECT} WHERE m.client_id = ?`, clientId);
  if (!row) return null;
  return attachFiles([mapMessage(row)])[0];
}

export async function markJobRead(userId: string, jobId: string, at: string) {
  await ready();
  run(
    `INSERT INTO read_cursors (user_id, job_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, job_id) DO UPDATE SET last_read_at = excluded.last_read_at
     WHERE excluded.last_read_at > read_cursors.last_read_at`,
    userId,
    jobId,
    at,
  );
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND job_id = ? AND read_at IS NULL", at, userId, jobId);
}

export async function listNotifications(userId: string) {
  await ready();
  return rows("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 80", userId).map((row): AppNotification => ({
    id: String(row.id),
    userId: String(row.user_id),
    jobId: s(row.job_id),
    kind: String(row.kind),
    title: String(row.title),
    body: String(row.body),
    href: s(row.href),
    readAt: s(row.read_at),
    createdAt: String(row.created_at),
  }));
}

export async function unreadSummary(userId: string, role: Role) {
  await ready();
  const jobWhere = role === "crew" ? "j.id IN (SELECT job_id FROM job_members WHERE user_id = ?)" : "1=1";
  const params = role === "crew" ? [userId, userId, userId, userId] : [userId, userId, userId];
  const chats = Number(
    one(
      `SELECT COUNT(*) AS n FROM jobs j WHERE ${jobWhere} AND ${UNREAD} > 0`,
      ...params,
    )?.n || 0,
  );
  const alerts = Number(one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId)?.n || 0);
  return { chats, alerts };
}

export async function markAllNotificationsRead(userId: string) {
  await ready();
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", new Date().toISOString(), userId);
}

export async function activeShare(jobId: string) {
  await ready();
  const row = one("SELECT * FROM share_links WHERE job_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1", jobId);
  return row ? mapShare(row) : null;
}

export async function shareByToken(token: string) {
  await ready();
  const row = one("SELECT * FROM share_links WHERE token = ?", token);
  return row ? mapShare(row) : null;
}

function mapShare(row: Record<string, unknown>): ShareRow {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    token: String(row.token),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    revokedAt: s(row.revoked_at),
  };
}

export async function listInvites() {
  await ready();
  return rows(
    `SELECT i.*, j.name AS job_name, u.name AS created_by_name
     FROM invites i
     LEFT JOIN jobs j ON j.id = i.job_id
     JOIN users u ON u.id = i.created_by
     ORDER BY i.created_at DESC LIMIT 40`,
  ).map(mapInvite);
}

export async function inviteByToken(token: string) {
  await ready();
  const row = one(
    `SELECT i.*, j.name AS job_name, u.name AS created_by_name
     FROM invites i
     LEFT JOIN jobs j ON j.id = i.job_id
     JOIN users u ON u.id = i.created_by
     WHERE i.token = ?`,
    token,
  );
  return row ? mapInvite(row) : null;
}

function mapInvite(row: Record<string, unknown>): InviteView {
  return {
    id: String(row.id),
    email: s(row.email),
    phone: s(row.phone),
    name: s(row.name),
    role: String(row.role) as Role,
    jobId: s(row.job_id),
    jobName: s(row.job_name),
    createdByName: String(row.created_by_name || ""),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    acceptedAt: s(row.accepted_at),
    token: String(row.token),
  };
}

export async function adminCount() {
  await ready();
  return Number(one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")?.n || 0);
}

export function insertUserSync(user: User & { passwordHash: string }) {
  run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, locale, active, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    user.name,
    user.email,
    user.phone,
    user.passwordHash,
    user.role,
    user.locale,
    user.active ? 1 : 0,
    user.isDemo ? 1 : 0,
    user.createdAt,
  );
}

export function touchJob(jobId: string, at: string) {
  run("UPDATE jobs SET updated_at = ? WHERE id = ?", at, jobId);
}

export { tx, one, run, rows };
export type { Locale };
