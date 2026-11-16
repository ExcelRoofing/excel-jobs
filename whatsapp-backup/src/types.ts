export type MediaKind = "image" | "video" | "audio" | "document";

export type Normalized = {
  id: string;
  groupJid: string;
  senderJid: string;
  senderName: string;
  timestampMs: number;
  text: string | null;
  caption: string | null;
  media: null | {
    kind: MediaKind;
    mime: string;
    originalName: string | null;
    bytesHint: number | null;
  };
};

export type Inbound = {
  id: string;
  groupJid: string;
  groupName: string;
  senderJid: string;
  senderName: string;
  timestampMs: number;
  text: string | null;
  caption: string | null;
  source: "live" | "history";
  media: null | {
    kind: MediaKind;
    mime: string;
    originalName: string | null;
    localPath: string;
    sha256: string;
    bytes: number;
  };
};

export type ConnectionName = "starting" | "qr" | "connected" | "disconnected" | "logged_out" | "disabled";

export type LiveState = {
  connection: ConnectionName;
  detail: string;
  phone: string | null;
  groups: { jid: string; name: string }[];
  qr: string | null;
  startedAt: string;
};
