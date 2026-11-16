import { rm } from "fs/promises";
import { displayPath, logLine, planFiling } from "./filing.ts";
import { writeTextAtomic } from "./files.ts";
import type { GroupMap } from "./group-map.ts";
import { matchGroup } from "./group-map.ts";
import { DriveError, type DriveClient } from "./drive.ts";
import { JobsError, planJobsPush, type JobsClient } from "./jobs.ts";
import { Store, type JobPayload, type MediaPayload } from "./store.ts";
import type { Inbound } from "./types.ts";

export type PipelineContext = {
  store: Store;
  drive: DriveClient | null;
  rootFolderId: string;
  rootLabel: string;
  timeZone: string;
  jobs: JobsClient | null;
  groupMap: GroupMap;
  maxAttempts: number;
};

export type IngestResult =
  | { action: "queued"; drivePath?: string }
  | { action: "duplicate"; reason: "message_id" | "same_bytes" }
  | { action: "ignored" };

export function retryDelayMs(attempts: number): number {
  const step = Math.max(0, attempts - 1);
  return Math.min(15 * 60 * 1000, 2000 * 2 ** Math.min(step, 8));
}

export async function ingest(message: Inbound, ctx: PipelineContext): Promise<IngestResult> {
  if (ctx.store.hasMessage(message.id)) return { action: "duplicate", reason: "message_id" };

  if (message.media) {
    const prior = ctx.store.findActiveHash(message.groupJid, message.media.sha256);
    if (prior) {
      ctx.store.remember({
        messageId: message.id,
        groupJid: message.groupJid,
        hash: message.media.sha256,
        kind: message.media.kind,
        status: "duplicate",
      });
      await rm(message.media.localPath, { force: true }).catch(() => undefined);
      return { action: "duplicate", reason: "same_bytes" };
    }
    const plan = planFiling({
      groupName: message.groupName,
      senderName: message.senderName,
      timestampMs: message.timestampMs,
      timeZone: ctx.timeZone,
      originalName: message.media.originalName,
      mime: message.media.mime,
      kind: message.media.kind,
      caption: message.caption,
      messageId: message.id,
    });
    const payload: MediaPayload = {
      type: "media",
      messageId: message.id,
      groupJid: message.groupJid,
      groupName: message.groupName,
      senderName: message.senderName,
      timestampMs: message.timestampMs,
      kind: message.media.kind,
      mime: plan.filename.endsWith(".jpg") && message.media.mime === "image/jpg" ? "image/jpeg" : message.media.mime,
      originalName: message.media.originalName,
      caption: message.caption,
      localPath: message.media.localPath,
      sha256: message.media.sha256,
      bytes: message.media.bytes,
    };
    ctx.store.remember({
      messageId: message.id,
      groupJid: message.groupJid,
      hash: message.media.sha256,
      kind: message.media.kind,
      status: "queued",
    });
    ctx.store.enqueue(message.id, payload);
    rememberLog(ctx, message, plan.day, plan.filename);
    return { action: "queued", drivePath: plan.drivePath };
  }

  const text = (message.text || "").trim();
  if (!text) return { action: "ignored" };
  ctx.store.remember({
    messageId: message.id,
    groupJid: message.groupJid,
    hash: null,
    kind: "text",
    status: "text",
  });
  const day = rememberLog(ctx, message, null, null);
  return { action: "queued", drivePath: day ? `${message.groupName}/${day}/messages.txt` : undefined };
}

function rememberLog(ctx: PipelineContext, message: Inbound, knownDay: string | null, filename: string | null): string {
  const line = logLine({
    timestampMs: message.timestampMs,
    timeZone: ctx.timeZone,
    senderName: message.senderName,
    text: message.text,
    kind: message.media?.kind || null,
    filename,
    caption: message.caption,
  });
  const day = knownDay || line && planDay(message.timestampMs, ctx.timeZone);
  ctx.store.appendLog({ messageId: message.id, groupJid: message.groupJid, day, line, sortTs: message.timestampMs });
  ctx.store.enqueue(`log:${message.groupJid}:${day}`, {
    type: "log",
    groupJid: message.groupJid,
    groupName: message.groupName,
    day,
  });
  return day;
}

function planDay(timestampMs: number, timeZone: string): string {
  return planFiling({
    groupName: "x",
    senderName: "x",
    timestampMs,
    timeZone,
    originalName: null,
    mime: "text/plain",
    kind: "document",
    caption: null,
    messageId: "day",
  }).day;
}

export async function pump(ctx: PipelineContext, opts: { now?: number; limit?: number } = {}): Promise<{ processed: number; failed: number }> {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 20;
  let processed = 0;
  let failed = 0;
  while (processed < limit) {
    const item = ctx.store.takeNext(now);
    if (!item) break;
    processed += 1;
    try {
      await runItem(ctx, item.id, item.payload);
      ctx.store.complete(item.id);
      if (item.payload.type === "log") {
        const saved = Number(ctx.store.getMeta(logCountKey(item.payload)) || "0");
        if (ctx.store.logCount(item.payload.groupJid, item.payload.day) > saved) {
          ctx.store.enqueue(`log:${item.payload.groupJid}:${item.payload.day}`, item.payload, now);
        }
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "upload failed";
      const configuredGap = error instanceof DriveError && error.status === 0;
      const attempts = item.attempts + (configuredGap ? 0 : 1);
      const delay = configuredGap ? 60_000 : retryDelayMs(attempts);
      if (!configuredGap && attempts >= ctx.maxAttempts) ctx.store.dead(item.id, message, item.payload);
      else ctx.store.defer(item.id, attempts, now + delay, message, freshPayload(item.id, ctx));
    }
  }
  return { processed, failed };
}

function logCountKey(payload: { groupJid: string; day: string }): string {
  return `logcount:${payload.groupJid}:${payload.day}`;
}

function freshPayload(id: number, ctx: PipelineContext): JobPayload {
  const row = ctx.store.db.prepare("SELECT payload FROM queue WHERE id = ?").get(id) as { payload: string } | undefined;
  if (!row) throw new Error("queue item disappeared");
  return JSON.parse(row.payload) as JobPayload;
}

async function runItem(ctx: PipelineContext, id: number, payload: JobPayload): Promise<void> {
  if (payload.type === "log") {
    await uploadLog(ctx, payload);
    return;
  }
  await uploadMedia(ctx, id, payload);
}

async function uploadLog(ctx: PipelineContext, payload: Extract<JobPayload, { type: "log" }>): Promise<void> {
  const text = ctx.store.logText(payload.groupJid, payload.day);
  if (!text) return;
  const local = ctx.store.logDir(payload.groupJid, payload.day);
  await writeTextAtomic(local, text);
  const drive = requireDrive(ctx);
  const group = planFiling({
    groupName: payload.groupName,
    senderName: "x",
    timestampMs: Date.parse(`${payload.day}T12:00:00Z`),
    timeZone: "UTC",
    originalName: "messages.txt",
    mime: "text/plain",
    kind: "document",
    caption: null,
    messageId: "log",
  });
  // The day's folder follows the message clock already stored on the row.
  // Rebuild only the group segment so a slash in the name cannot escape the folder.
  const groupName = group.segments[0] || payload.groupName;
  const dayFolder = await drive.ensureFolder(await drive.ensureFolder(ctx.rootFolderId, groupName), payload.day);
  const drivePath = displayPath(ctx.rootLabel, `${groupName}/${payload.day}/messages.txt`);
  let fileId = ctx.store.getLogFileId(payload.groupJid, payload.day);
  if (fileId) {
    try {
      await drive.updateFile(fileId, "text/plain", local);
    } catch (error) {
      if (error instanceof DriveError && error.status === 404) fileId = null;
      else throw error;
    }
  }
  if (!fileId) {
    const created = await drive.uploadFile(dayFolder, "messages.txt", "text/plain", local);
    fileId = created.id;
    ctx.store.setLogFileId(payload.groupJid, payload.day, fileId);
  }
  ctx.store.recordUpload({
    groupName: payload.groupName,
    drivePath,
    kind: "log",
    jobsStatus: "",
    bytes: Buffer.byteLength(text),
  });
  ctx.store.setMeta(logCountKey(payload), String(ctx.store.logCount(payload.groupJid, payload.day)));
}

async function uploadMedia(ctx: PipelineContext, id: number, payload: MediaPayload): Promise<void> {
  const plan = planFiling({
    groupName: payload.groupName,
    senderName: payload.senderName,
    timestampMs: payload.timestampMs,
    timeZone: ctx.timeZone,
    originalName: payload.originalName,
    mime: payload.mime,
    kind: payload.kind,
    caption: payload.caption,
    messageId: payload.messageId,
  });
  if (!payload.driveFileId) {
    const drive = requireDrive(ctx);
    let parent = ctx.rootFolderId;
    for (const segment of plan.segments) parent = await drive.ensureFolder(parent, segment);
    const uploaded = await drive.uploadFile(parent, plan.filename, payload.mime || "application/octet-stream", payload.localPath);
    payload.driveFileId = uploaded.id;
    payload.drivePath = plan.drivePath;
    ctx.store.savePayload(id, payload);
    ctx.store.markUploaded({
      messageId: payload.messageId,
      driveFileId: uploaded.id,
      drivePath: displayPath(ctx.rootLabel, plan.drivePath),
      jobsStatus: ctx.jobs ? "pending" : "off",
      jobsDetail: null,
      groupName: payload.groupName,
      kind: payload.kind,
      bytes: payload.bytes,
    });
  }
  if (!payload.jobsDone) {
    const jobsStatus = await pushJobs(ctx, payload, plan.tags[0]?.slug || null, plan.filename);
    payload.jobsDone = true;
    payload.jobsStatus = jobsStatus.status;
    payload.jobsDetail = jobsStatus.detail;
    ctx.store.savePayload(id, payload);
    ctx.store.markJobs(payload.messageId, displayPath(ctx.rootLabel, payload.drivePath || plan.drivePath), jobsStatus.status, jobsStatus.detail);
  }
  if (payload.driveFileId && payload.jobsDone) await rm(payload.localPath, { force: true }).catch(() => undefined);
}

async function pushJobs(
  ctx: PipelineContext,
  payload: MediaPayload,
  tagSlug: string | null,
  filename: string,
): Promise<{ status: string; detail: string | null }> {
  if (!ctx.jobs) return { status: "off", detail: null };
  const rule = matchGroup(ctx.groupMap, payload.groupJid, payload.groupName);
  const decision = planJobsPush({
    mapped: Boolean(rule),
    mime: payload.mime,
    filename: payload.originalName,
    bytes: payload.bytes,
    tagSlug,
    defaultTag: rule?.defaultTag || null,
  });
  if (decision.action === "skip") return { status: decision.reason, detail: null };
  if (!rule) return { status: "unmapped", detail: null };
  try {
    const note = [payload.caption?.trim(), `WhatsApp backup from ${payload.senderName} in ${payload.groupName}`].filter(Boolean).join(" — ");
    await ctx.jobs.push({
      jobId: rule.jobId,
      filename,
      mime: decision.mime,
      filePath: payload.localPath,
      note,
      takenAt: new Date(payload.timestampMs).toISOString(),
      clientId: `wa:${payload.messageId}`,
      kind: decision.kind,
      tagSlug: decision.tagSlug,
    });
    return { status: "uploaded", detail: null };
  } catch (error) {
    if (error instanceof JobsError && error.permanent) {
      return { status: "failed", detail: error.message };
    }
    throw error;
  }
}

function requireDrive(ctx: PipelineContext): DriveClient {
  if (!ctx.drive || !ctx.rootFolderId) {
    throw new DriveError("Google Drive is not configured yet. The file is waiting on the server.", 0, true);
  }
  return ctx.drive;
}
