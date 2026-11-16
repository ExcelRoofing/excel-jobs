import { mkdir, rm } from "fs/promises";
import path from "path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { pino } from "pino";
import { saveStream } from "./files.ts";
import { baseMime } from "./filing.ts";
import { normalizeMessage, phoneFromJid, type NameBook } from "./normalize.ts";
import type { ConnectionName, Inbound } from "./types.ts";

export type WhatsAppOptions = {
  sessionDir: string;
  inboxDir: string;
  backfill: "off" | "recent" | "full";
  maxMediaBytes: number;
  countryCode: string;
  waLogLevel: string;
  seen: (id: string) => boolean;
  acceptHistory: () => boolean;
  isBackfillDone: () => boolean;
  markBackfillDone: () => void;
  onMessage: (message: Inbound) => Promise<void>;
  onFailure: (info: { id: string; group: string; error: string }) => void;
  onConnection: (info: { connection: ConnectionName; detail: string; phone: string | null; qr: string | null; groups: { jid: string; name: string }[] }) => void;
};

type ContactLike = { id?: string; phoneNumber?: string; name?: string; notify?: string; verifiedName?: string };
type ChatLike = { id?: string | null; name?: string | null };

function disconnectCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const output = (error as { output?: { statusCode?: number } }).output;
  if (typeof output?.statusCode === "number") return output.statusCode;
  const statusCode = (error as { statusCode?: number }).statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

/**
 * Read-only WhatsApp Web session.
 * This file must not call outgoing chat methods. A test locks that in.
 * Media recovery may ask a phone to re-upload an expired file. That is not a group message.
 */
export async function startWhatsApp(opts: WhatsAppOptions): Promise<{ stop: () => Promise<void> }> {
  await mkdir(opts.sessionDir, { recursive: true });
  const logger = pino({ level: opts.waLogLevel || "silent" });
  const { state, saveCreds } = await useMultiFileAuthState(opts.sessionDir);
  const groupNames = new Map<string, string>();
  const contactNames = new Map<string, string>();
  const oldest = new Map<string, { key: WAMessage["key"]; ts: number }>();
  let stopped = false;
  let current: ReturnType<typeof makeWASocket> | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let backfillTimer: NodeJS.Timeout | null = null;
  let attempt = 0;
  let backfillStarted = false;
  let chain = Promise.resolve();
  let phone: string | null = state.creds.me?.id ? phoneFromJid(state.creds.me.id) : null;

  const names: NameBook = {
    groupName(jid) {
      return groupNames.get(jid) || `Group ${jid.replace(/\D/g, "").slice(-6) || "chat"}`;
    },
    senderName(jid, pushName) {
      if (pushName && pushName.trim()) return pushName.trim();
      return contactNames.get(jid) || (jid === "me" ? "Backup phone" : phoneFromJid(jid));
    },
  };

  const known = (jid: string) => groupNames.has(jid);

  function rememberGroup(jid: string | null | undefined, subject: string | null | undefined) {
    if (!jid || !subject) return;
    groupNames.set(jid, subject);
  }

  function rememberContacts(contacts: ContactLike[]) {
    for (const contact of contacts) {
      const name = contact.name || contact.notify || contact.verifiedName;
      if (!name) continue;
      if (contact.id) contactNames.set(contact.id, name);
      if (contact.phoneNumber) contactNames.set(contact.phoneNumber, name);
    }
  }

  function publish(partial: { connection?: ConnectionName; detail?: string; qr?: string | null }) {
    opts.onConnection({
      connection: partial.connection || "starting",
      detail: partial.detail || "",
      phone,
      qr: partial.qr === undefined ? null : partial.qr,
      groups: [...groupNames.entries()].map(([jid, name]) => ({ jid, name })),
    });
  }

  function later(work: () => Promise<void>) {
    chain = chain.then(work).catch((error) => {
      opts.onFailure({ id: "", group: "", error: error instanceof Error ? error.message : "backup error" });
    });
  }

  async function refreshGroups(sock: ReturnType<typeof makeWASocket>) {
    const all = await sock.groupFetchAllParticipating();
    for (const group of Object.values(all)) rememberGroup(group.id, group.subject);
    publish({ connection: "connected", detail: `Connected${phone ? ` as ${phone}` : ""}. Watching ${groupNames.size} group${groupNames.size === 1 ? "" : "s"}.`, qr: null });
  }

  async function runBackfill(sock: ReturnType<typeof makeWASocket>) {
    if (stopped || backfillStarted || opts.backfill !== "recent" || opts.isBackfillDone()) return;
    backfillStarted = true;
    for (const [jid, item] of oldest) {
      if (opts.isBackfillDone()) break;
      try {
        await sock.fetchMessageHistory(50, item.key, item.ts);
      } catch (error) {
        opts.onFailure({ id: "", group: names.groupName(jid), error: error instanceof Error ? error.message : "history request failed" });
      }
    }
    opts.markBackfillDone();
  }

  async function deliver(sock: ReturnType<typeof makeWASocket>, raw: WAMessage, source: "live" | "history") {
    const normalized = normalizeMessage(raw, names, known);
    if (!normalized) return;
    if (source === "history") {
      const ts = normalized.timestampMs / 1000;
      const prev = oldest.get(normalized.groupJid);
      if (!prev || ts < prev.ts) oldest.set(normalized.groupJid, { key: raw.key, ts });
    }
    if (opts.seen(normalized.id)) return;
    if (!groupNames.has(normalized.groupJid)) {
      try {
        const meta = await sock.groupMetadata(normalized.groupJid);
        rememberGroup(meta.id || normalized.groupJid, meta.subject);
      } catch {
        /* keep a fallback name if WhatsApp will not describe this group yet */
      }
    }
    if (normalized.media?.bytesHint && normalized.media.bytesHint > opts.maxMediaBytes) {
      opts.onFailure({
        id: normalized.id,
        group: names.groupName(normalized.groupJid),
        error: `Skipped a ${normalized.media.kind} larger than the size limit`,
      });
      return;
    }
    let media: Inbound["media"] = null;
    if (normalized.media) {
      const safe = normalized.id.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 140);
      const dest = path.join(opts.inboxDir, safe);
      let last: unknown;
      for (let i = 0; i < 3; i++) {
        try {
          const stream = await downloadMediaMessage(raw, "stream", {}, { logger, reuploadRequest: (msg) => sock.updateMediaMessage(msg) });
          const saved = await saveStream(stream, dest, opts.maxMediaBytes);
          media = {
            kind: normalized.media.kind,
            mime: baseMime(normalized.media.mime, normalized.media.originalName),
            originalName: normalized.media.originalName,
            localPath: dest,
            sha256: saved.hash,
            bytes: saved.bytes,
          };
          last = null;
          break;
        } catch (error) {
          last = error;
          await rm(dest, { force: true }).catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
      if (!media) {
        opts.onFailure({
          id: normalized.id,
          group: names.groupName(normalized.groupJid),
          error: last instanceof Error ? last.message : "could not download the file",
        });
        return;
      }
    }
    await opts.onMessage({
      id: normalized.id,
      groupJid: normalized.groupJid,
      groupName: names.groupName(normalized.groupJid),
      senderJid: normalized.senderJid,
      senderName: normalized.senderName,
      timestampMs: normalized.timestampMs,
      text: normalized.text,
      caption: normalized.caption,
      source,
      media,
    });
  }

  function handleBatch(sock: ReturnType<typeof makeWASocket>, messages: WAMessage[], source: "live" | "history", chats?: ChatLike[], contacts?: ContactLike[]) {
    if (contacts) rememberContacts(contacts);
    if (chats) {
      for (const chat of chats) {
        if (chat.id && chat.name && (chat.id.endsWith("@g.us") || known(chat.id))) rememberGroup(chat.id, chat.name);
      }
    }
    for (const message of messages) {
      if (source === "history") {
        const peek = normalizeMessage(message, names, known);
        if (!peek || opts.seen(peek.id)) continue;
        if (!opts.acceptHistory()) break;
      }
      later(async () => {
        if (current !== sock || stopped) return;
        await deliver(sock, message, source);
      });
    }
  }

  const connect = () => {
    if (stopped) return;
    const sock = makeWASocket({
      auth: state,
      logger,
      browser: opts.backfill === "full" ? Browsers.macOS("Desktop") : Browsers.ubuntu("Excel Backup"),
      syncFullHistory: opts.backfill === "full",
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      shouldSyncHistoryMessage: () => opts.backfill !== "off",
      shouldIgnoreJid: (jid) => jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@newsletter"),
      getMessage: async () => undefined,
      countryCode: opts.countryCode || "CA",
    });
    current = sock;
    sock.ev.on("creds.update", () => {
      void saveCreds();
      const id = sock.authState.creds.me?.id;
      if (id) phone = phoneFromJid(id);
    });
    sock.ev.on("connection.update", (update) => {
      if (current !== sock || stopped) return;
      if (update.qr) {
        publish({ connection: "qr", detail: "Scan this QR code from the backup phone. WhatsApp → Linked devices → Link a device.", qr: update.qr });
      }
      if (update.connection === "open") {
        attempt = 0;
        publish({ connection: "connected", detail: "Connected. Loading groups.", qr: null });
        later(async () => {
          try {
            await refreshGroups(sock);
          } catch (error) {
            opts.onFailure({ id: "", group: "", error: error instanceof Error ? error.message : "could not list groups" });
          }
        });
        if (backfillTimer) clearTimeout(backfillTimer);
        backfillTimer = setTimeout(() => void runBackfill(sock), 20_000);
      }
      if (update.connection === "close") {
        const code = disconnectCode(update.lastDisconnect?.error);
        if (code === DisconnectReason.loggedOut) {
          publish({ connection: "logged_out", detail: "WhatsApp logged this device out. On the server, stop the service, delete the session folder, start again, and scan a new QR code.", qr: null });
          return;
        }
        const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
        attempt += 1;
        publish({ connection: "disconnected", detail: `Connection closed (${code ?? "unknown"}). Trying again shortly.`, qr: null });
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, delay);
      }
    });
    sock.ev.on("messaging-history.set", (payload) => {
      handleBatch(sock, payload.messages, "history", payload.chats, payload.contacts);
    });
    sock.ev.on("messaging-history.status", (status) => {
      if (status.status === "complete") void runBackfill(sock);
    });
    sock.ev.on("messages.upsert", (payload) => {
      const source = payload.type === "notify" ? "live" : "history";
      if (source === "history" && opts.backfill === "off") return;
      handleBatch(sock, payload.messages, source);
    });
    sock.ev.on("groups.upsert", (groups) => {
      for (const group of groups) rememberGroup(group.id, group.subject);
    });
    sock.ev.on("groups.update", (groups) => {
      for (const group of groups) rememberGroup(group.id, group.subject);
    });
    sock.ev.on("contacts.upsert", (contacts) => rememberContacts(contacts));
  };

  publish({ connection: "starting", detail: "Starting WhatsApp. The QR code will show here if this phone is not linked yet.", qr: null });
  connect();

  return {
    stop: async () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (backfillTimer) clearTimeout(backfillTimer);
      const sock = current;
      current = null;
      if (sock) await sock.end(undefined);
    },
  };
}
