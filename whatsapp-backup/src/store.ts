import { mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

export type JobPayload = MediaPayload | LogPayload;

export type MediaPayload = {
  type: "media";
  messageId: string;
  groupJid: string;
  groupName: string;
  senderName: string;
  timestampMs: number;
  kind: "image" | "video" | "audio" | "document";
  mime: string;
  originalName: string | null;
  caption: string | null;
  localPath: string;
  sha256: string;
  bytes: number;
  driveFileId?: string;
  drivePath?: string;
  jobsDone?: boolean;
  jobsStatus?: string;
  jobsDetail?: string | null;
};

export type LogPayload = {
  type: "log";
  groupJid: string;
  groupName: string;
  day: string;
};

export type QueueItem = {
  id: number;
  attempts: number;
  payload: JobPayload;
};

export type UploadRow = {
  at: string;
  groupName: string;
  drivePath: string;
  kind: string;
  jobsStatus: string;
  bytes: number;
};

type SeenStatus = "queued" | "uploaded" | "duplicate" | "text";

function nowIso(): string {
  return new Date().toISOString();
}

export class Store {
  readonly db: DatabaseSync;
  readonly dir: string;

  private constructor(db: DatabaseSync, dir: string) {
    this.db = db;
    this.dir = dir;
  }

  static open(dir: string): Store {
    mkdirSync(dir, { recursive: true });
    mkdirSync(path.join(dir, "inbox"), { recursive: true });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    mkdirSync(path.join(dir, "session"), { recursive: true });
    const db = new DatabaseSync(path.join(dir, "backup.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seen (
        message_id TEXT PRIMARY KEY,
        group_jid TEXT NOT NULL,
        content_hash TEXT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        drive_file_id TEXT,
        drive_path TEXT,
        jobs_status TEXT,
        jobs_detail TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_seen_hash ON seen(group_jid, content_hash);
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dedupe_key TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS log_lines (
        message_id TEXT PRIMARY KEY,
        group_jid TEXT NOT NULL,
        day TEXT NOT NULL,
        line TEXT NOT NULL,
        sort_ts INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS log_files (
        group_jid TEXT NOT NULL,
        day TEXT NOT NULL,
        drive_file_id TEXT,
        PRIMARY KEY (group_jid, day)
      );
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        group_name TEXT NOT NULL,
        drive_path TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        jobs_status TEXT,
        bytes INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS drive_folders (
        cache_key TEXT PRIMARY KEY,
        drive_id TEXT NOT NULL
      );
    `);
    const store = new Store(db, dir);
    store.db.prepare("UPDATE queue SET status = 'pending' WHERE status = 'running'").run();
    store.cleanInbox();
    return store;
  }

  inboxDir(): string {
    return path.join(this.dir, "inbox");
  }

  sessionDir(): string {
    return path.join(this.dir, "session");
  }

  logDir(groupJid: string, day: string): string {
    const safe = groupJid.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    return path.join(this.dir, "logs", safe, `${day}.txt`);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  hasMessage(id: string): boolean {
    const row = this.db.prepare("SELECT message_id FROM seen WHERE message_id = ?").get(id) as { message_id: string } | undefined;
    return Boolean(row);
  }

  findActiveHash(groupJid: string, hash: string): string | null {
    const row = this.db.prepare(
      "SELECT message_id FROM seen WHERE group_jid = ? AND content_hash = ? AND status IN ('queued', 'uploaded') LIMIT 1",
    ).get(groupJid, hash) as { message_id: string } | undefined;
    return row?.message_id || null;
  }

  remember(input: {
    messageId: string;
    groupJid: string;
    hash: string | null;
    kind: string;
    status: SeenStatus;
  }): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO seen (message_id, group_jid, content_hash, kind, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO NOTHING`,
      )
      .run(input.messageId, input.groupJid, input.hash, input.kind, input.status, now, now);
  }

  enqueue(dedupeKey: string, payload: JobPayload, when = Date.now()): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO queue (dedupe_key, payload, attempts, next_attempt_at, status)
         VALUES (?, ?, 0, ?, 'pending')
         ON CONFLICT(dedupe_key) DO NOTHING`,
      )
      .run(dedupeKey, JSON.stringify(payload), when);
    return result.changes > 0;
  }

  appendLog(input: { messageId: string; groupJid: string; day: string; line: string; sortTs: number }): void {
    this.db
      .prepare(
        `INSERT INTO log_lines (message_id, group_jid, day, line, sort_ts)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO NOTHING`,
      )
      .run(input.messageId, input.groupJid, input.day, input.line, input.sortTs);
  }

  logText(groupJid: string, day: string): string {
    const rows = this.db
      .prepare("SELECT line FROM log_lines WHERE group_jid = ? AND day = ? ORDER BY sort_ts, message_id")
      .all(groupJid, day) as { line: string }[];
    if (!rows.length) return "";
    return `${rows.map((row) => row.line).join("\n")}\n`;
  }

  logCount(groupJid: string, day: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM log_lines WHERE group_jid = ? AND day = ?").get(groupJid, day) as { n: number };
    return Number(row.n || 0);
  }

  getLogFileId(groupJid: string, day: string): string | null {
    const row = this.db.prepare("SELECT drive_file_id FROM log_files WHERE group_jid = ? AND day = ?").get(groupJid, day) as
      | { drive_file_id: string | null }
      | undefined;
    return row?.drive_file_id || null;
  }

  setLogFileId(groupJid: string, day: string, driveFileId: string): void {
    this.db
      .prepare(
        `INSERT INTO log_files (group_jid, day, drive_file_id) VALUES (?, ?, ?)
         ON CONFLICT(group_jid, day) DO UPDATE SET drive_file_id = excluded.drive_file_id`,
      )
      .run(groupJid, day, driveFileId);
  }

  takeNext(now = Date.now()): QueueItem | null {
    const row = this.db
      .prepare("SELECT id, attempts, payload FROM queue WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id LIMIT 1")
      .get(now) as { id: number; attempts: number; payload: string } | undefined;
    if (!row) return null;
    this.db.prepare("UPDATE queue SET status = 'running' WHERE id = ?").run(row.id);
    return { id: Number(row.id), attempts: Number(row.attempts), payload: JSON.parse(row.payload) as JobPayload };
  }

  savePayload(id: number, payload: JobPayload): void {
    this.db.prepare("UPDATE queue SET payload = ? WHERE id = ?").run(JSON.stringify(payload), id);
  }

  complete(id: number): void {
    this.db.prepare("DELETE FROM queue WHERE id = ?").run(id);
  }

  defer(id: number, attempts: number, nextAt: number, error: string, payload: JobPayload): void {
    this.db
      .prepare("UPDATE queue SET status = 'pending', attempts = ?, next_attempt_at = ?, last_error = ?, payload = ? WHERE id = ?")
      .run(attempts, nextAt, error.slice(0, 500), JSON.stringify(payload), id);
    this.setMeta("last_error", error.slice(0, 500));
  }

  dead(id: number, error: string, payload: JobPayload): void {
    this.db
      .prepare("UPDATE queue SET status = 'dead', last_error = ?, payload = ? WHERE id = ?")
      .run(error.slice(0, 500), JSON.stringify(payload), id);
    this.setMeta("last_error", error.slice(0, 500));
  }

  requeueDead(now = Date.now()): number {
    const result = this.db
      .prepare("UPDATE queue SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL WHERE status = 'dead'")
      .run(now);
    return Number(result.changes || 0);
  }

  markUploaded(input: {
    messageId: string;
    driveFileId: string;
    drivePath: string;
    jobsStatus: string;
    jobsDetail: string | null;
    groupName: string;
    kind: string;
    bytes: number;
  }): void {
    const now = nowIso();
    this.db
      .prepare(
        `UPDATE seen SET status = 'uploaded', drive_file_id = ?, drive_path = ?, jobs_status = ?, jobs_detail = ?, updated_at = ?
         WHERE message_id = ?`,
      )
      .run(input.driveFileId, input.drivePath, input.jobsStatus, input.jobsDetail, now, input.messageId);
    this.recordUpload({
      groupName: input.groupName,
      drivePath: input.drivePath,
      kind: input.kind,
      jobsStatus: input.jobsStatus,
      bytes: input.bytes,
    });
  }

  markJobs(messageId: string, drivePath: string, jobsStatus: string, jobsDetail: string | null): void {
    this.db.prepare("UPDATE seen SET jobs_status = ?, jobs_detail = ?, updated_at = ? WHERE message_id = ?").run(jobsStatus, jobsDetail, nowIso(), messageId);
    this.db.prepare("UPDATE uploads SET jobs_status = ? WHERE drive_path = ?").run(jobsStatus, drivePath);
  }

  recordUpload(input: { groupName: string; drivePath: string; kind: string; jobsStatus: string; bytes: number }): void {
    const at = nowIso();
    this.db
      .prepare(
        `INSERT INTO uploads (at, group_name, drive_path, kind, jobs_status, bytes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(drive_path) DO UPDATE SET at = excluded.at, jobs_status = excluded.jobs_status, bytes = excluded.bytes`,
      )
      .run(at, input.groupName, input.drivePath, input.kind, input.jobsStatus, input.bytes);
  }

  counts(): { pending: number; running: number; dead: number; seen: number } {
    const one = (status: string) => {
      const row = this.db.prepare("SELECT COUNT(*) AS n FROM queue WHERE status = ?").get(status) as { n: number };
      return Number(row.n || 0);
    };
    const seen = this.db.prepare("SELECT COUNT(*) AS n FROM seen").get() as { n: number };
    return { pending: one("pending"), running: one("running"), dead: one("dead"), seen: Number(seen.n || 0) };
  }

  recentUploads(limit = 20): UploadRow[] {
    const rows = this.db
      .prepare("SELECT at, group_name, drive_path, kind, jobs_status, bytes FROM uploads ORDER BY at DESC, id DESC LIMIT ?")
      .all(limit) as { at: string; group_name: string; drive_path: string; kind: string; jobs_status: string | null; bytes: number }[];
    return rows.map((row) => ({
      at: row.at,
      groupName: row.group_name,
      drivePath: row.drive_path,
      kind: row.kind,
      jobsStatus: row.jobs_status || "",
      bytes: Number(row.bytes || 0),
    }));
  }

  folderId(cacheKey: string): string | null {
    const row = this.db.prepare("SELECT drive_id FROM drive_folders WHERE cache_key = ?").get(cacheKey) as { drive_id: string } | undefined;
    return row?.drive_id || null;
  }

  saveFolderId(cacheKey: string, driveId: string): void {
    this.db
      .prepare("INSERT INTO drive_folders (cache_key, drive_id) VALUES (?, ?) ON CONFLICT(cache_key) DO UPDATE SET drive_id = excluded.drive_id")
      .run(cacheKey, driveId);
  }

  forgetFolder(cacheKey: string): void {
    this.db.prepare("DELETE FROM drive_folders WHERE cache_key = ?").run(cacheKey);
  }

  private referencedInbox(): Set<string> {
    const rows = this.db.prepare("SELECT payload FROM queue").all() as { payload: string }[];
    const paths = new Set<string>();
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload) as { localPath?: string };
        if (payload.localPath) paths.add(payload.localPath);
      } catch {
        /* ignore a bad row */
      }
    }
    return paths;
  }

  private cleanInbox(): void {
    const inbox = this.inboxDir();
    const keep = this.referencedInbox();
    const cutoff = Date.now() - 60 * 60 * 1000;
    let names: string[] = [];
    try {
      names = readdirSync(inbox);
    } catch {
      return;
    }
    for (const name of names) {
      const full = path.join(inbox, name);
      if (keep.has(full)) continue;
      try {
        const stat = statSync(full);
        if (stat.isFile() && stat.mtimeMs < cutoff) unlinkSync(full);
      } catch {
        /* another process may have removed it */
      }
    }
  }
}
