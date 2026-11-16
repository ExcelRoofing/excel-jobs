import type { Division, JobStatus, Role } from "./types";

export const COMPANY = {
  name: "Excel Roofing & Solar",
  product: "Excel Jobs",
  phoneDisplay: "604-330-1415",
  phoneHref: "tel:+16043301415",
  email: "info@excelroofing.ca",
  address: "#607, 12835 Lilley Dr, Maple Ridge, BC",
  mapsQuery: "#607, 12835 Lilley Dr, Maple Ridge, BC",
  site: "https://excelroofing.ca",
  city: "Maple Ridge, BC",
};

export const DEMO_PASSWORD = "demo1234";

export const DIVISIONS: Division[] = ["roofing", "skylights", "solar"];
export const STATUSES: JobStatus[] = ["lead", "scheduled", "in_progress", "complete"];
export const ROLES: Role[] = ["admin", "office", "crew"];

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const PACIFIC_TZ = "America/Vancouver";

export const DEFAULT_TAGS: { slug: string; en: string; fr: string }[] = [
  { slug: "before", en: "Before", fr: "Avant" },
  { slug: "during", en: "During", fr: "Pendant" },
  { slug: "after", en: "After", fr: "Après" },
  { slug: "damage", en: "Damage", fr: "Dommage" },
  { slug: "flashing", en: "Flashing", fr: "Solin" },
  { slug: "skylight", en: "Skylight", fr: "Puits de lumière" },
  { slug: "solar", en: "Solar", fr: "Solaire" },
  { slug: "materials", en: "Materials", fr: "Matériaux" },
  { slug: "safety", en: "Safety", fr: "Sécurité" },
  { slug: "completion", en: "Completion", fr: "Fin des travaux" },
];

export function isDivision(v: string): v is Division {
  return (DIVISIONS as string[]).includes(v);
}

export function isStatus(v: string): v is JobStatus {
  return (STATUSES as string[]).includes(v);
}

export function isRole(v: string): v is Role {
  return (ROLES as string[]).includes(v);
}

export function canManage(role: Role) {
  return role === "admin" || role === "office";
}

export function canAdmin(role: Role) {
  return role === "admin";
}
