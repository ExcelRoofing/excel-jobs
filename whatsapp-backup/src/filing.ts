import { detectTags, type TagHit } from "./tags.ts";
import { zonedParts } from "./time.ts";
import type { MediaKind } from "./types.ts";

export type FilingInput = {
  groupName: string;
  senderName: string;
  timestampMs: number;
  timeZone: string;
  originalName: string | null;
  mime: string;
  kind: MediaKind;
  caption: string | null;
  messageId: string;
};

export type FilingPlan = {
  day: string;
  time: string;
  clock: string;
  tags: TagHit[];
  folderTag: string | null;
  filename: string;
  segments: string[];
  drivePath: string;
};

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  mp4: "video/mp4",
  mov: "video/quicktime",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function baseMime(mime: string, filename: string | null): string {
  const lower = (mime || "").split(";")[0].trim().toLowerCase();
  if (lower && lower !== "application/octet-stream") {
    if (lower === "image/jpg") return "image/jpeg";
    return lower;
  }
  const ext = extensionOf(filename || "");
  return (ext && EXT_MIME[ext]) || lower || "application/octet-stream";
}

export function sanitizeSegment(input: string, fallback: string, max = 80): string {
  const cleaned = input
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return cleaned || fallback;
}

export function sanitizeToken(input: string, fallback: string, max = 40): string {
  return sanitizeSegment(input, fallback, max).replace(/\s+/g, "-");
}

function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] || "";
}

function defaultExt(kind: MediaKind): string {
  if (kind === "image") return "jpg";
  if (kind === "video") return "mp4";
  if (kind === "audio") return "ogg";
  return "bin";
}

function defaultStem(kind: MediaKind): string {
  if (kind === "image") return "photo";
  if (kind === "video") return "video";
  if (kind === "audio") return "voice";
  return "file";
}

export function shortId(messageId: string): string {
  const cleaned = messageId.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned.slice(-4) || "msg").toLowerCase();
}

export function planFiling(input: FilingInput): FilingPlan {
  const when = zonedParts(input.timestampMs, input.timeZone);
  const tags = detectTags(input.caption);
  const mime = baseMime(input.mime, input.originalName);
  const original = input.originalName || "";
  const ext = extensionOf(original) || MIME_EXT[mime] || defaultExt(input.kind);
  const stemSource = original.replace(/\.([a-z0-9]{1,8})$/i, "");
  const stem = sanitizeToken(stemSource, defaultStem(input.kind), 50);
  const sender = sanitizeToken(input.senderName, "Unknown", 40);
  const tagPart = tags.length ? `_${tags.map((tag) => tag.slug).join("+")}` : "";
  const filename = `${when.time}${tagPart}_${sender}_${stem}_${shortId(input.messageId)}.${ext}`;
  const group = sanitizeSegment(input.groupName, "Unknown group", 80);
  const segments = [group, when.day];
  if (tags[0]) segments.push(tags[0].folder);
  return {
    day: when.day,
    time: when.time,
    clock: when.clock,
    tags,
    folderTag: tags[0]?.folder || null,
    filename,
    segments,
    drivePath: [...segments, filename].join("/"),
  };
}

export function logLine(input: {
  timestampMs: number;
  timeZone: string;
  senderName: string;
  text?: string | null;
  kind?: MediaKind | null;
  filename?: string | null;
  caption?: string | null;
}): string {
  const clock = zonedParts(input.timestampMs, input.timeZone).clock;
  const sender = sanitizeSegment(input.senderName || "Unknown", "Unknown", 80);
  let body: string;
  if (input.kind) {
    const label = input.kind === "image" ? "photo" : input.kind === "audio" ? "voice" : input.kind === "video" ? "video" : "file";
    body = `[${label}] ${input.filename || input.kind}`;
    const caption = (input.caption || "").replace(/\s+/g, " ").trim();
    if (caption) body += ` | ${caption}`;
  } else {
    body = (input.text || "").replace(/\s+/g, " ").trim();
  }
  return `[${clock}] ${sender}: ${body}`;
}

export function displayPath(rootLabel: string, drivePath: string): string {
  const root = sanitizeSegment(rootLabel, "WhatsApp Backup", 80);
  return `${root}/${drivePath}`;
}
