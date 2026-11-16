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
  upgrade(db);
}

function columnNames(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
}

function addColumn(db: DatabaseSync, table: string, column: string, ddl: string) {
  if (!columnNames(db, table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function upgrade(db: DatabaseSync) {
  addColumn(db, "jobs", "latitude", "REAL");
  addColumn(db, "jobs", "longitude", "REAL");
  addColumn(db, "jobs", "geocoded_at", "TEXT");
  addColumn(db, "share_links", "kind", "TEXT NOT NULL DEFAULT 'timeline'");
  addColumn(db, "share_links", "label", "TEXT");
  addColumn(db, "files", "derived_from_id", "TEXT");
  addColumn(db, "files", "duration_seconds", "REAL");

  const tableSql = String((db.prepare("SELECT sql FROM sqlite_master WHERE name = 'files'").get() as { sql: string }).sql);
  if (!tableSql.includes("'video'")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(`
        CREATE TABLE files_v2 (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('photo','document','chat','video','comparison','markup','report')),
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
          ai_status TEXT,
          derived_from_id TEXT,
          duration_seconds REAL
        );
      `);
      db.exec(`
        INSERT INTO files_v2 (
          id, job_id, kind, storage_key, filename, mime, size, tag_id, note, taken_at,
          latitude, longitude, gps_accuracy, customer_visible, uploaded_by, created_at,
          library_path, drive_file_id, drive_path, drive_synced_at, drive_error, client_id,
          ai_tags, ai_status, derived_from_id, duration_seconds
        )
        SELECT
          id, job_id, kind, storage_key, filename, mime, size, tag_id, note, taken_at,
          latitude, longitude, gps_accuracy, customer_visible, uploaded_by, created_at,
          library_path, drive_file_id, drive_path, drive_synced_at, drive_error, client_id,
          ai_tags, ai_status, derived_from_id, duration_seconds
        FROM files;
      `);
      db.exec("DROP TABLE files");
      db.exec("ALTER TABLE files_v2 RENAME TO files");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS files_client_id ON files(client_id) WHERE client_id IS NOT NULL");
      db.exec("CREATE INDEX IF NOT EXISTS idx_files_job ON files(job_id, created_at)");
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* already closed */
      }
      db.exec("PRAGMA foreign_keys = ON");
      throw error;
    }
    db.exec("PRAGMA foreign_keys = ON");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_tags (
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id),
      PRIMARY KEY (file_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS file_stars (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, file_id)
    );
    CREATE TABLE IF NOT EXISTS file_comments (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      guest_name TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS file_comment_mentions (
      comment_id TEXT NOT NULL REFERENCES file_comments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY (comment_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      color TEXT NOT NULL,
      sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_labels (
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (job_id, label_id)
    );
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checklist_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
      sort INTEGER NOT NULL,
      title_en TEXT NOT NULL,
      title_fr TEXT NOT NULL,
      instructions_en TEXT,
      instructions_fr TEXT,
      photo_required INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      template_id TEXT,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
      sort INTEGER NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT,
      photo_required INTEGER NOT NULL DEFAULT 1,
      completed_at TEXT,
      completed_by TEXT
    );
    CREATE TABLE IF NOT EXISTS checklist_item_files (
      item_id TEXT NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, file_id)
    );
    CREATE TABLE IF NOT EXISTS share_items (
      share_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      PRIMARY KEY (share_id, file_id)
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      job_id TEXT,
      file_id TEXT,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_file ON file_comments(file_id, created_at);
  `);
}

export function ready() {
  if (!globalDb.__excelReady) {
    openDatabase();
    globalDb.__excelReady = import("./seed").then(async (mod) => {
        await mod.seedIfEmpty();
        mod.seedExtras();
      })
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
