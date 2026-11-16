import { driveReady, loadConfig } from "./config.ts";
import { createGoogleDrive, oauthRefreshToken, serviceAccountToken, type DriveClient } from "./drive.ts";
import { loadGroupMap } from "./group-map.ts";
import { createHttpJobs } from "./jobs.ts";
import { createLogger } from "./log.ts";
import { startAdmin, type AdminSnapshot } from "./admin.ts";
import { ingest, pump, type PipelineContext } from "./pipeline.ts";
import { Store } from "./store.ts";
import type { LiveState } from "./types.ts";
import { startWhatsApp } from "./whatsapp.ts";

const startedAt = new Date().toISOString();

async function main() {
  const config = loadConfig();
  const log = createLogger(config.logLevel);
  const store = Store.open(config.dataDir);
  const live: LiveState = {
    connection: config.waDisabled ? "disabled" : "starting",
    detail: config.waDisabled ? "WhatsApp is turned off (WA_DISABLED=on). The admin page is up." : "Starting.",
    phone: null,
    groups: [],
    qr: null,
    startedAt,
  };

  let drive: DriveClient | null = null;
  if (config.google && config.driveRootFolderId) {
    const token =
      config.google.mode === "service_account"
        ? serviceAccountToken({ email: config.google.email, privateKey: config.google.privateKey })
        : oauthRefreshToken(config.google);
    drive = createGoogleDrive({
      token,
      folders: {
        get: (key) => store.folderId(key),
        set: (key, id) => store.saveFolderId(key, id),
        forget: (key) => store.forgetFolder(key),
      },
    });
  }

  const ctx: PipelineContext = {
    store,
    drive,
    rootFolderId: config.driveRootFolderId,
    rootLabel: config.driveRootName,
    timeZone: config.timeZone,
    jobs: config.jobs ? createHttpJobs(config.jobs) : null,
    groupMap: config.jobs ? loadGroupMap(config.jobs.mapPath) : { groups: [] },
    maxAttempts: config.maxAttempts,
  };

  if (!driveReady(config)) {
    log.warn("Google Drive is not configured. Files will wait on disk until the keys and folder id are set.");
  }
  if (config.jobs && ctx.groupMap.groups.length === 0) {
    log.warn(`Excel Jobs copy is on, but ${config.jobs.mapPath} has no groups yet.`);
  }

  const snapshot = (): AdminSnapshot => {
    const counts = store.counts();
    return {
      connection: live.connection,
      detail: live.detail,
      phone: live.phone,
      groups: live.groups,
      hasQr: Boolean(live.qr),
      queue: { pending: counts.pending, running: counts.running, dead: counts.dead },
      recent: store.recentUploads(20),
      lastError: store.getMeta("last_error"),
      drive: driveReady(config) ? "ready" : "not_configured",
      jobsPush: Boolean(config.jobs),
      startedAt,
    };
  };

  const admin = await startAdmin({
    host: config.host,
    port: config.port,
    token: config.adminToken,
    getStatus: snapshot,
    getQr: () => live.qr,
    onRetry: () => store.requeueDead(),
  });
  log.info(`Admin page on http://${config.host}:${admin.port}/`);

  let stopWhatsApp = async () => {};
  if (!config.waDisabled) {
    const wa = await startWhatsApp({
      sessionDir: store.sessionDir(),
      inboxDir: store.inboxDir(),
      backfill: config.backfill,
      maxMediaBytes: config.maxMediaBytes,
      countryCode: config.countryCode,
      waLogLevel: config.waLogLevel,
      seen: (id) => store.hasMessage(id),
      acceptHistory: () => {
        const count = Number(store.getMeta("history_count") || "0");
        if (count >= config.backfillLimit) return false;
        store.setMeta("history_count", String(count + 1));
        return true;
      },
      isBackfillDone: () => store.getMeta("backfill_done") === "yes",
      markBackfillDone: () => store.setMeta("backfill_done", "yes"),
      onConnection: (info) => {
        live.connection = info.connection;
        live.detail = info.detail;
        live.phone = info.phone;
        live.groups = info.groups;
        live.qr = info.qr;
        store.setMeta("connection", info.connection);
        store.setMeta("connection_detail", info.detail);
        if (info.phone) store.setMeta("phone", info.phone);
      },
      onFailure: (info) => {
        const text = info.group ? `${info.group}: ${info.error}` : info.error;
        store.setMeta("last_error", text.slice(0, 500));
        log.warn(text);
      },
      onMessage: async (message) => {
        const result = await ingest(message, ctx);
        if (result.action === "queued") log.info(`queued ${message.groupName} ${result.drivePath || message.id}`);
      },
    });
    stopWhatsApp = wa.stop;
  }

  let pumping = false;
  const timer = setInterval(() => {
    if (pumping) return;
    pumping = true;
    pump(ctx, { limit: 2 })
      .catch((error) => log.error("queue failed", error))
      .finally(() => {
        pumping = false;
      });
  }, 2000);

  const shutdown = async () => {
    clearInterval(timer);
    await stopWhatsApp();
    await admin.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
