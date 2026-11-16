import type { MediaKind, Normalized } from "./types.ts";

export type NameBook = {
  groupName: (jid: string) => string;
  senderName: (jid: string, pushName?: string | null) => string;
};

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
  "deviceSentMessage",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object" && "low" in value && typeof (value as { low: unknown }).low === "number") {
    const low = (value as { low: number; high?: number }).low;
    const high = (value as { high?: number }).high || 0;
    return high * 4294967296 + low;
  }
  return null;
}

export function toMillis(value: unknown): number | null {
  const n = numberish(value);
  if (n === null || n <= 0) return null;
  return n > 10_000_000_000 ? n : n * 1000;
}

function unwrap(message: unknown): Record<string, unknown> | null {
  let current = asRecord(message);
  for (let i = 0; i < 6 && current; i++) {
    const protocol = asRecord(current.protocolMessage);
    const edited = protocol ? asRecord(protocol.editedMessage) : null;
    if (edited) {
      current = edited;
      continue;
    }
    let next: Record<string, unknown> | null = null;
    for (const key of WRAPPERS) {
      const wrapped = asRecord(current[key]);
      const inner = wrapped ? asRecord(wrapped.message) : null;
      if (inner) {
        next = inner;
        break;
      }
    }
    if (!next) return current;
    current = next;
  }
  return current;
}

function mediaOf(record: Record<string, unknown>, key: string, kind: MediaKind): {
  kind: MediaKind;
  mime: string;
  originalName: string | null;
  bytesHint: number | null;
  caption: string | null;
} | null {
  const media = asRecord(record[key]);
  if (!media) return null;
  const mime = typeof media.mimetype === "string" && media.mimetype ? media.mimetype : defaultMime(kind);
  const originalName = typeof media.fileName === "string" ? media.fileName : typeof media.filename === "string" ? media.filename : null;
  const caption = typeof media.caption === "string" ? media.caption : null;
  return { kind, mime, originalName, bytesHint: numberish(media.fileLength), caption };
}

function defaultMime(kind: MediaKind): string {
  if (kind === "image") return "image/jpeg";
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/ogg";
  return "application/octet-stream";
}

function textOf(record: Record<string, unknown>): string | null {
  if (typeof record.conversation === "string") return record.conversation;
  const extended = asRecord(record.extendedTextMessage);
  if (extended && typeof extended.text === "string") return extended.text;
  return null;
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return Boolean(jid && jid.endsWith("@g.us"));
}

/** Turn one Baileys message into a backup record. Direct chats and non-files return null. */
export function normalizeMessage(input: unknown, names: NameBook, isKnownGroup: (jid: string) => boolean): Normalized | null {
  const raw = asRecord(input);
  if (!raw) return null;
  const key = asRecord(raw.key);
  if (!key) return null;
  const remote = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const alt = typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : "";
  if (remote === "status@broadcast" || remote.endsWith("@broadcast") || remote.endsWith("@newsletter")) return null;
  let groupJid = "";
  if (isGroupJid(remote)) groupJid = remote;
  else if (isGroupJid(alt)) groupJid = alt;
  else if (remote && isKnownGroup(remote)) groupJid = remote;
  else return null;
  const rawId = typeof key.id === "string" ? key.id : "";
  if (!rawId) return null;
  const body = unwrap(raw.message);
  if (!body) return null;
  const image = mediaOf(body, "imageMessage", "image");
  const video = mediaOf(body, "videoMessage", "video");
  const audio = mediaOf(body, "audioMessage", "audio");
  const document = mediaOf(body, "documentMessage", "document");
  const media = image || video || audio || document;
  const text = textOf(body);
  if (!media && !(text && text.trim())) return null;
  const senderJid =
    (typeof key.participant === "string" && key.participant) ||
    (typeof key.participantAlt === "string" && key.participantAlt) ||
    (key.fromMe ? "me" : groupJid);
  const timestampMs = toMillis(raw.messageTimestamp) ?? Date.now();
  return {
    id: `${groupJid}:${rawId}`,
    groupJid,
    senderJid,
    senderName: names.senderName(senderJid, typeof raw.pushName === "string" ? raw.pushName : null),
    timestampMs,
    text: media ? null : text,
    caption: media?.caption || null,
    media: media ? { kind: media.kind, mime: media.mime, originalName: media.originalName, bytesHint: media.bytesHint } : null,
  };
}

export function phoneFromJid(jid: string): string {
  return jid.replace(/@.*/, "").replace(/:.*/, "") || jid;
}
