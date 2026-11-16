import "server-only";
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const globalDb = globalThis as unknown as {
  __excelDb?: DatabaseSync;
  __excelReady?: Promise<void>;
};

export function dataDir() {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function blobDir() {
  const dir = path.join(dataDir(), "blobs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function libraryDir() {
  const dir = path.join(dataDir(), "library");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function openDatabase() {
  if (globalDb.__excelDb) return globalDb.__excelDb;
  const file = path.join(dataDir(), "excel-jobs.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  globalDb.__excelDb = db;
  return db;
}

export function getDb() {
  if (!globalDb.__excelDb) openDatabase();
  return globalDb.__excelDb as DatabaseSync;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','office','crew')),
      locale TEXT NOT NULL DEFAULT 'en',
      active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT,
      address TEXT NOT NULL,
      city TEXT,
      division TEXT NOT NULL CHECK(division IN ('roofing','skylights','solar')),
      status TEXT NOT NULL CHECK(status IN ('lead','scheduled','in_progress','complete')),
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      source_url TEXT,
      source_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS job_members (
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      added_by TEXT,
      added_at TEXT NOT NULL,
      PRIMARY KEY (job_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      sort INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('photo','document','chat')),
      storage_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      tag_id TEXT REFERENCES tags(id),
      note TEXT,
      taken_at TEXT,
      latitude REAL,
      longitude REAL,
      gps_accuracy REAL,
      customer_visible INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT,
      created_at TEXT NOT NULL,
      library_path TEXT,
      drive_file_id TEXT,
      drive_path TEXT,
      drive_synced_at TEXT,
      drive_error TEXT,
      client_id TEXT,
      ai_tags TEXT,
      ai_status TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      client_id TEXT
    );

    CREATE TABLE IF NOT EXISTS message_mentions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS message_files (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      PRIMARY KEY (message_id, file_id)
    );

    CREATE TABLE IF NOT EXISTS read_cursors (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      last_read_at TEXT NOT NULL,
      PRIMARY KEY (user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      href TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      email TEXT,
      phone TEXT,
      name TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin','office','crew')),
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      accepted_user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      storage_key TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drive_folders (
      cache_key TEXT PRIMARY KEY,
      drive_id TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS files_client_id ON files(client_id) WHERE client_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS messages_client_id ON messages(client_id) WHERE client_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_messages_job_time ON messages(job_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_files_job ON files(job_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at);
  `);
  db.exec("PRAGMA user_version = 1;");
}

export function ready() {
  if (!globalDb.__excelReady) {
    openDatabase();
    globalDb.__excelReady = import("./seed")
      .then((mod) => mod.seedIfEmpty())
      .catch((error) => {
        globalDb.__excelReady = undefined;
        throw error;
      });
  }
  return globalDb.__excelReady;
}

export type SqlValue = string | number | bigint | null | Uint8Array;

export function rows(sql: string, ...params: SqlValue[]) {
  return getDb().prepare(sql).all(...params) as Record<string, unknown>[];
}

export function one(sql: string, ...params: SqlValue[]) {
  const row = getDb().prepare(sql).get(...params) as Record<string, unknown> | undefined;
  return row ?? null;
}

export function run(sql: string, ...params: SqlValue[]) {
  return getDb().prepare(sql).run(...params);
}

export function tx(fn: () => void) {
  const db = getDb();
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}
