export type Role = "admin" | "office" | "crew";
export type Locale = "en" | "fr";
export type Division = "roofing" | "skylights" | "solar";
export type JobStatus = "lead" | "scheduled" | "in_progress" | "complete";
export type FileKind = "photo" | "document" | "chat" | "video" | "comparison" | "markup" | "report";
export type ShareKind = "timeline" | "gallery" | "guest";

export type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  locale: Locale;
  active: boolean;
  isDemo: boolean;
  createdAt: string;
};

export type Tag = {
  id: string;
  nameEn: string;
  nameFr: string;
  slug: string;
  sort: number;
  active: boolean;
};

export type Job = {
  id: string;
  name: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  address: string;
  city: string | null;
  division: Division;
  status: JobStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceSyncedAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type JobListItem = Job & {
  unread: number;
  photoCount: number;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  lastMessageName: string | null;
};

export type Member = {
  id: string;
  name: string;
  role: Role;
  phone: string | null;
  email: string | null;
  locale: Locale;
  active: boolean;
};

export type JobFile = {
  id: string;
  jobId: string;
  kind: FileKind;
  filename: string;
  mime: string;
  size: number;
  tagId: string | null;
  tagSlug: string | null;
  tagNameEn: string | null;
  tagNameFr: string | null;
  note: string | null;
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracy: number | null;
  customerVisible: boolean;
  uploadedBy: string | null;
  uploaderName: string | null;
  createdAt: string;
  libraryPath: string | null;
  driveFileId: string | null;
  drivePath: string | null;
  driveSyncedAt: string | null;
  driveError: string | null;
  clientId: string | null;
  derivedFromId: string | null;
  durationSeconds: number | null;
  starred: boolean;
};

export type ChatMessage = {
  id: string;
  jobId: string;
  userId: string;
  userName: string;
  userRole: Role;
  body: string;
  createdAt: string;
  mentionIds: string[];
  files: JobFile[];
};

export type InviteView = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: Role;
  jobId: string | null;
  jobName: string | null;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  token: string;
};

export type AppNotification = {
  id: string;
  userId: string;
  jobId: string | null;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ShareRow = {
  id: string;
  jobId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
  kind: ShareKind;
};

export type ChatListItem = {
  job: Job;
  unread: number;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  lastMessageName: string | null;
};
