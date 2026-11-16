import { writeFile } from "fs/promises";
import path from "path";
import { createFlakyDrive, createMemoryDrive } from "./drive.ts";
import { planFiling } from "./filing.ts";
import type { JobsPush } from "./jobs.ts";
import { ingest, pump, type IngestResult, type PipelineContext } from "./pipeline.ts";
import { Store } from "./store.ts";
import type { Inbound, MediaKind } from "./types.ts";

const ZONE = "America/Vancouver";
const BASE = Date.parse("2026-01-15T07:30:45.000Z");

export type ScenarioReport = {
  files: { path: string; text: string }[];
  pushes: JobsPush[];
  failures: number;
  results: { label: string; result: IngestResult }[];
  log: string;
};

export async function runScenario(dir: string): Promise<ScenarioReport> {
  const store = Store.open(dir);
  const memory = createMemoryDrive("root");
  const flaky = createFlakyDrive(memory.drive, 1);
  const pushes: JobsPush[] = [];
  const ctx: PipelineContext = {
    store,
    drive: flaky.drive,
    rootFolderId: "root",
    rootLabel: "WhatsApp Backup",
    timeZone: ZONE,
    jobs: {
      async push(input) {
        pushes.push(input);
        return { fileId: `job-${pushes.length}` };
      },
    },
    groupMap: { groups: [{ group: "Chen reroof", jobId: "job-chen", defaultTag: "during" }] },
    maxAttempts: 5,
  };
  const results: { label: string; result: IngestResult }[] = [];

  const send = async (label: string, message: Inbound) => {
    results.push({ label, result: await ingest(message, ctx) });
  };

  await send("text", message({
    id: "111@g.us:text01",
    at: BASE,
    sender: "Sam Crowe",
    text: "On the roof, flashing next",
  }));
  const photo = await fileMessage(store, {
    id: "111@g.us:ph01",
    at: BASE + 17_000,
    sender: "Sam Crowe",
    kind: "image",
    mime: "image/jpeg",
    originalName: "roof.jpg",
    caption: "Avant le solin",
    body: "photo-avant-solin",
  });
  await send("photo", photo);
  await send("same message", photo);
  await send("same bytes", await fileMessage(store, {
    id: "111@g.us:ph02",
    at: BASE + 20_000,
    sender: "Sam Crowe",
    kind: "image",
    mime: "image/jpeg",
    originalName: "roof-copy.jpg",
    caption: "Avant le solin",
    body: "photo-avant-solin",
  }));
  await send("voice", await fileMessage(store, {
    id: "111@g.us:vc01",
    at: BASE + 80_000,
    sender: "Sam Crowe",
    kind: "audio",
    mime: "audio/ogg; codecs=opus",
    originalName: null,
    caption: null,
    body: "voice-bytes",
  }));
  await send("pdf", await fileMessage(store, {
    id: "111@g.us:dc01",
    at: BASE + 90_000,
    sender: "Alexe Moreau",
    kind: "document",
    mime: "application/pdf",
    originalName: "invoice.pdf",
    caption: "sécurité sur le toit",
    body: "%PDF-1.4 demo",
  }));
  await send("video", await fileMessage(store, {
    id: "111@g.us:vd01",
    at: BASE + 100_000,
    sender: "Sam Crowe",
    kind: "video",
    mime: "video/mp4",
    originalName: "clip.mp4",
    caption: "after the panels",
    body: "video-bytes",
  }));
  await send("untagged", await fileMessage(store, {
    id: "111@g.us:ph03",
    at: BASE + 110_000,
    sender: "Sam Crowe",
    kind: "image",
    mime: "image/jpeg",
    originalName: "deck.jpg",
    caption: null,
    body: "plain-deck",
  }));
  await send("materials", await fileMessage(store, {
    id: "111@g.us:ph04",
    at: BASE + 120_000,
    sender: "Sam Crowe",
    kind: "image",
    mime: "image/jpeg",
    originalName: "pile.jpg",
    caption: "materials on site",
    body: "pile-bytes",
  }));
  await send("other group", await fileMessage(store, {
    id: "222@g.us:ph09",
    at: BASE + 130_000,
    sender: "Alexe Moreau",
    groupJid: "222@g.us",
    groupName: "Puits Bergeron",
    kind: "image",
    mime: "image/jpeg",
    originalName: "done.jpg",
    caption: "fin des travaux",
    body: "done-bytes",
  }));

  let now = Date.now();
  for (let i = 0; i < 12; i++) {
    const counts = store.counts();
    if (counts.pending === 0 && counts.running === 0) break;
    await pump(ctx, { now, limit: 20 });
    now += 60_000;
  }

  const log = memory.files.find((file) => file.path.endsWith("Chen reroof/2026-01-14/messages.txt"));
  return {
    files: memory.files.map((file) => ({ path: file.path, text: file.bytes.toString("utf8") })),
    pushes,
    failures: flaky.failures(),
    results,
    log: log ? log.bytes.toString("utf8") : "",
  };
}

function message(input: { id: string; at: number; sender: string; text: string; groupJid?: string; groupName?: string }): Inbound {
  return {
    id: input.id,
    groupJid: input.groupJid || "111@g.us",
    groupName: input.groupName || "Chen reroof",
    senderJid: "16045550100@s.whatsapp.net",
    senderName: input.sender,
    timestampMs: input.at,
    text: input.text,
    caption: null,
    source: "live",
    media: null,
  };
}

async function fileMessage(store: Store, input: {
  id: string;
  at: number;
  sender: string;
  kind: MediaKind;
  mime: string;
  originalName: string | null;
  caption: string | null;
  body: string;
  groupJid?: string;
  groupName?: string;
}): Promise<Inbound> {
  const local = path.join(store.inboxDir(), input.id.replace(/[^a-zA-Z0-9._-]+/g, "_"));
  const bytes = Buffer.from(input.body);
  await writeFile(local, bytes);
  const { createHash } = await import("crypto");
  return {
    id: input.id,
    groupJid: input.groupJid || "111@g.us",
    groupName: input.groupName || "Chen reroof",
    senderJid: "16045550100@s.whatsapp.net",
    senderName: input.sender,
    timestampMs: input.at,
    text: null,
    caption: input.caption,
    source: "live",
    media: {
      kind: input.kind,
      mime: input.mime,
      originalName: input.originalName,
      localPath: local,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    },
  };
}

export function expectedPhotoName(): string {
  return planFiling({
    groupName: "Chen reroof",
    senderName: "Sam Crowe",
    timestampMs: BASE + 17_000,
    timeZone: ZONE,
    originalName: "roof.jpg",
    mime: "image/jpeg",
    kind: "image",
    caption: "Avant le solin",
    messageId: "111@g.us:ph01",
  }).drivePath;
}
