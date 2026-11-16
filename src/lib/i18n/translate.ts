import type { Dict, DictKey } from "./en";
import { en } from "./en";
import { fr } from "./fr";
import type { Locale } from "../types";

export function translate(dict: Dict, key: DictKey, vars?: Record<string, string | number>) {
  let text: string = dict[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export function dictionary(locale: Locale): Dict {
  return locale === "fr" ? fr : en;
}

const ERROR_KEYS: Record<string, DictKey> = {
  bad_login: "badLogin",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  not_found: "notFound",
  weak_password: "weakPassword",
  password_mismatch: "passwordMismatch",
  wrong_password: "wrongPassword",
  email_taken: "emailTaken",
  name_required: "nameRequired",
  customer_required: "customerRequired",
  address_required: "addressRequired",
  division_required: "divisionRequired",
  tag_required: "missingTag",
  tag_names: "tagNamesRequired",
  file_too_large: "fileTooLarge",
  bad_file: "badFile",
  file_missing: "fileMissing",
  empty_message: "emptyMessage",
  email_or_phone: "phoneOrEmail",
  invite_invalid: "inviteBad",
  invite_used: "inviteUsed",
  invite_expired: "inviteExpired",
  last_admin: "lastAdmin",
  cannot_self: "cannotSelf",
  already_member: "alreadyOnJob",
  name_too_short: "nameTooShort",
  invalid_email: "invalidEmail",
  server_error: "serverError",
  zip_confirm: "needConfirmZip",
};

export function errorKey(code: string | undefined | null): DictKey {
  if (!code) return "errorGeneric";
  return ERROR_KEYS[code] || "errorGeneric";
}
