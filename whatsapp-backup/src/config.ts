import { existsSync, readFileSync } from "fs";
import path from "path";

export type GoogleConfig =
  | { mode: "service_account"; email: string; privateKey: string }
  | { mode: "oauth"; clientId: string; clientSecret: string; refreshToken: string };

export type JobsConfig = {
  url: string;
  email: string;
  password: string;
  mapPath: string;
};

export type Config = {
  dataDir: string;
  host: string;
  port: number;
  adminToken: string;
  timeZone: string;
  driveRootFolderId: string;
  driveRootName: string;
  google: GoogleConfig | null;
  jobs: JobsConfig | null;
  backfill: "off" | "recent" | "full";
  backfillLimit: number;
  maxAttempts: number;
  maxMediaBytes: number;
  logLevel: string;
  waLogLevel: string;
  waDisabled: boolean;
  countryCode: string;
};

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Load a .env file without overriding variables that are already set. */
export function loadEnvFile(file = path.join(process.cwd(), ".env")): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = unquote(line.slice(eq + 1));
  }
}

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be a number`);
  return Math.floor(value);
}

function googleFromEnv(env: NodeJS.ProcessEnv): GoogleConfig | null {
  const email = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (email && privateKey) return { mode: "service_account", email, privateKey };
  const clientId = (env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = (env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const refreshToken = (env.GOOGLE_OAUTH_REFRESH_TOKEN || "").trim();
  if (clientId && clientSecret && refreshToken) return { mode: "oauth", clientId, clientSecret, refreshToken };
  return null;
}

export function configFromEnv(env: NodeJS.ProcessEnv, cwd = process.cwd()): Config {
  const backfillRaw = (env.BACKFILL || "recent").trim().toLowerCase();
  if (backfillRaw !== "off" && backfillRaw !== "recent" && backfillRaw !== "full") {
    throw new Error("BACKFILL must be recent, full, or off");
  }
  const jobsOn = (env.EXCEL_JOBS_PUSH || "off").trim().toLowerCase() === "on";
  let jobs: JobsConfig | null = null;
  if (jobsOn) {
    const email = (env.EXCEL_JOBS_EMAIL || "").trim();
    const password = env.EXCEL_JOBS_PASSWORD || "";
    if (!email || !password) throw new Error("EXCEL_JOBS_PUSH=on needs EXCEL_JOBS_EMAIL and EXCEL_JOBS_PASSWORD");
    const url = (env.EXCEL_JOBS_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
    const mapPath = path.resolve(cwd, env.EXCEL_JOBS_GROUP_MAP || "./group-map.json");
    jobs = { url, email, password, mapPath };
  }
  const host = (env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const adminToken = (env.ADMIN_TOKEN || "").trim();
  const dataDir = path.resolve(cwd, env.DATA_DIR || "./data");
  return {
    dataDir,
    host,
    port: intEnv(env, "PORT", 8787),
    adminToken,
    timeZone: (env.TIME_ZONE || "America/Vancouver").trim() || "America/Vancouver",
    driveRootFolderId: (env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim(),
    driveRootName: (env.DRIVE_ROOT_NAME || "WhatsApp Backup").trim() || "WhatsApp Backup",
    google: googleFromEnv(env),
    jobs,
    backfill: backfillRaw,
    backfillLimit: Math.max(1, intEnv(env, "BACKFILL_LIMIT", 400)),
    maxAttempts: Math.max(1, intEnv(env, "MAX_ATTEMPTS", 12)),
    maxMediaBytes: Math.max(1, intEnv(env, "MAX_MEDIA_BYTES", 80 * 1024 * 1024)),
    logLevel: (env.LOG_LEVEL || "info").trim() || "info",
    waLogLevel: (env.WA_LOG_LEVEL || "silent").trim() || "silent",
    waDisabled: (env.WA_DISABLED || "off").trim().toLowerCase() === "on",
    countryCode: (env.COUNTRY_CODE || "CA").trim() || "CA",
  };
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function assertRunnable(config: Config): void {
  if (!isLoopbackHost(config.host) && !config.adminToken) {
    throw new Error("Refusing to listen on a public address without ADMIN_TOKEN. Set ADMIN_TOKEN, or set HOST=127.0.0.1.");
  }
}

export function loadConfig(): Config {
  loadEnvFile();
  const config = configFromEnv(process.env);
  assertRunnable(config);
  return config;
}

export function driveReady(config: Config): boolean {
  return Boolean(config.google && config.driveRootFolderId);
}
