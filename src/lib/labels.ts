import type { DictKey } from "./i18n/en";
import type { Locale, Role } from "./types";

export function statusKey(status: string): DictKey {
  if (status === "scheduled") return "statusScheduled";
  if (status === "in_progress") return "statusInProgress";
  if (status === "complete") return "statusComplete";
  return "statusLead";
}

export function divisionKey(division: string): DictKey {
  if (division === "skylights") return "divisionSkylights";
  if (division === "solar") return "divisionSolar";
  return "divisionRoofing";
}

export function divisionHintKey(division: string): DictKey {
  if (division === "skylights") return "divisionSkylightsHint";
  if (division === "solar") return "divisionSolarHint";
  return "divisionRoofingHint";
}

export function roleKey(role: Role): DictKey {
  if (role === "admin") return "roleAdmin";
  if (role === "office") return "roleOffice";
  return "roleCrew";
}

export function tagLabel(tag: { nameEn: string; nameFr: string } | null, locale: Locale, fallback: string) {
  if (!tag) return fallback;
  return locale === "fr" ? tag.nameFr : tag.nameEn;
}
