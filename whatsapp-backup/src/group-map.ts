import { existsSync, readFileSync } from "fs";

export type GroupRule = {
  group: string;
  jobId: string;
  defaultTag: string | null;
};

export type GroupMap = {
  groups: GroupRule[];
};

export function parseGroupMap(text: string): GroupMap {
  const parsed = JSON.parse(text) as { groups?: { group?: string; jobId?: string; defaultTag?: string }[] };
  const groups: GroupRule[] = [];
  for (const row of parsed.groups || []) {
    const group = (row.group || "").trim();
    const jobId = (row.jobId || "").trim();
    if (!group || !jobId) continue;
    groups.push({ group, jobId, defaultTag: (row.defaultTag || "").trim() || null });
  }
  return { groups };
}

export function loadGroupMap(file: string): GroupMap {
  if (!existsSync(file)) return { groups: [] };
  return parseGroupMap(readFileSync(file, "utf8"));
}

export function matchGroup(map: GroupMap, groupJid: string, groupName: string): GroupRule | null {
  const name = groupName.trim().toLowerCase();
  for (const row of map.groups) {
    if (row.group === groupJid) return row;
    if (row.group.toLowerCase() === name) return row;
  }
  return null;
}
