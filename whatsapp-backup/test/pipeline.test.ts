import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import test from "node:test";
import { createMemoryDrive, DriveError } from "../src/drive.ts";
import { ingest, pump, retryDelayMs } from "../src/pipeline.ts";
import { expectedPhotoName, runScenario } from "../src/scenario.ts";
import { Store } from "../src/store.ts";
import type { Inbound } from "../src/types.ts";
import type { PipelineContext } from "../src/pipeline.ts";

test("retry waits grow and then stop at 15 minutes", () => {
  assert.equal(retryDelayMs(1), 2000);
  assert.equal(retryDelayMs(2), 4000);
  assert.equal(retryDelayMs(3), 8000);
  assert.ok(retryDelayMs(20) <= 15 * 60 * 1000);
});

test("end to end: fake WhatsApp messages land in Drive once, with tags, a day log, and job copies", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wa-scenario-"));
  try {
    const report = await runScenario(dir);
    const photo = expectedPhotoName();
    assert.equal(report.failures, 1);
    assert.ok(report.files.some((file) => file.path === photo), photo);
    const photoBytes = report.files.filter((file) => file.text === "photo-avant-solin");
    assert.equal(photoBytes.length, 1);
    assert.match(photo, /\/Before\/\d{6}_before\+flashing_Sam-Crowe_roof_ph01\.jpg$/);
    assert.ok(report.files.some((file) => file.path.includes("/After/") && file.path.endsWith(".mp4")));
    assert.ok(report.files.some((file) => file.path.includes("/Safety/") && file.path.endsWith(".pdf")));
    assert.ok(report.files.some((file) => file.path.includes("/Materials/")));
    assert.ok(report.files.some((file) => file.path.startsWith("Puits Bergeron/") && file.path.includes("/Completion/")));
    assert.equal(report.log.split("On the roof, flashing next").length, 2);
    assert.equal(report.log.split("[photo]").length, 4);
    assert.match(report.log, /\[voice\]/);
    const kinds = report.pushes.map((push) => `${push.kind}:${push.tagSlug || "-"}`);
    assert.deepEqual(kinds.sort(), ["document:safety", "photo:before", "photo:during", "photo:materials"].sort());
    assert.ok(report.pushes.every((push) => push.jobId === "job-chen"));
    assert.deepEqual(
      report.results.filter((item) => item.result.action === "duplicate").map((item) => item.label),
      ["same message", "same bytes"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Drive failure keeps the file and a later try uploads it once", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wa-retry-"));
  try {
    const store = Store.open(dir);
    const memory = createMemoryDrive();
    let fail = true;
    const ctx: PipelineContext = {
      store,
      drive: {
        ensureFolder: (parent, name) => memory.drive.ensureFolder(parent, name),
        async uploadFile(parent, name, mime, filePath) {
          if (fail) {
            fail = false;
            throw new DriveError("network down", 503, true);
          }
          return memory.drive.uploadFile(parent, name, mime, filePath);
        },
        updateFile: (id, mime, filePath) => memory.drive.updateFile(id, mime, filePath),
      },
      rootFolderId: "root",
      rootLabel: "WhatsApp Backup",
      timeZone: "America/Vancouver",
      jobs: null,
      groupMap: { groups: [] },
      maxAttempts: 4,
    };
    const local = path.join(store.inboxDir(), "one.jpg");
    await writeFile(local, Buffer.from("pic"));
    const message: Inbound = {
      id: "111@g.us:one1",
      groupJid: "111@g.us",
      groupName: "Chen reroof",
      senderJid: "me",
      senderName: "Sam",
      timestampMs: Date.parse("2026-01-15T07:30:45.000Z"),
      text: null,
      caption: "damage",
      source: "live",
      media: { kind: "image", mime: "image/jpeg", originalName: "one.jpg", localPath: local, sha256: "abc", bytes: 3 },
    };
    await ingest(message, ctx);
    let now = Date.now();
    const first = await pump(ctx, { now, limit: 5 });
    assert.equal(first.failed, 1);
    assert.equal(memory.files.filter((file) => file.path.includes("/Damage/")).length, 0);
    assert.equal(await readFile(local, "utf8"), "pic");
    now += 5000;
    await pump(ctx, { now, limit: 5 });
    const photos = memory.files.filter((file) => file.path.includes("/Damage/"));
    assert.equal(photos.length, 1);
    await assert.rejects(readFile(local, "utf8"));
    const before = memory.files.length;
    await ingest(message, ctx);
    now += 5000;
    await pump(ctx, { now, limit: 5 });
    assert.equal(memory.files.length, before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing Drive config does not burn retry attempts", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wa-nodrive-"));
  try {
    const store = Store.open(dir);
    const local = path.join(store.inboxDir(), "wait.jpg");
    await writeFile(local, Buffer.from("pic"));
    const ctx: PipelineContext = {
      store,
      drive: null,
      rootFolderId: "",
      rootLabel: "WhatsApp Backup",
      timeZone: "UTC",
      jobs: null,
      groupMap: { groups: [] },
      maxAttempts: 2,
    };
    await ingest(
      {
        id: "111@g.us:wait",
        groupJid: "111@g.us",
        groupName: "Chen",
        senderJid: "me",
        senderName: "Sam",
        timestampMs: Date.now(),
        text: null,
        caption: null,
        source: "live",
        media: { kind: "image", mime: "image/jpeg", originalName: "wait.jpg", localPath: local, sha256: "hash-1", bytes: 3 },
      },
      ctx,
    );
    const now = Date.now();
    await pump(ctx, { now, limit: 5 });
    await pump(ctx, { now: now + 120_000, limit: 5 });
    const row = store.db.prepare("SELECT attempts, status FROM queue").get() as { attempts: number; status: string };
    assert.equal(row.status, "pending");
    assert.equal(Number(row.attempts), 0);
    assert.match(store.getMeta("last_error") || "", /not configured/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a later text message updates the day log instead of uploading a second file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wa-log-"));
  try {
    const store = Store.open(dir);
    const memory = createMemoryDrive();
    const ctx: PipelineContext = {
      store,
      drive: memory.drive,
      rootFolderId: "root",
      rootLabel: "WhatsApp Backup",
      timeZone: "America/Vancouver",
      jobs: null,
      groupMap: { groups: [] },
      maxAttempts: 3,
    };
    const first: Inbound = {
      id: "111@g.us:t1",
      groupJid: "111@g.us",
      groupName: "Chen reroof",
      senderJid: "me",
      senderName: "Sam",
      timestampMs: Date.parse("2026-01-15T07:30:45.000Z"),
      text: "Arrived",
      caption: null,
      source: "live",
      media: null,
    };
    await ingest(first, ctx);
    let now = Date.now();
    await pump(ctx, { now, limit: 5 });
    const logs = () => memory.files.filter((file) => file.name === "messages.txt");
    assert.equal(logs().length, 1);
    assert.match(logs()[0].bytes.toString("utf8"), /Arrived/);
    await ingest({ ...first, id: "111@g.us:t2", text: "Shingles are open", timestampMs: first.timestampMs + 1000 }, ctx);
    now += 5000;
    await pump(ctx, { now, limit: 5 });
    assert.equal(logs().length, 1);
    const text = logs()[0].bytes.toString("utf8");
    assert.match(text, /Arrived/);
    assert.match(text, /Shingles are open/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
