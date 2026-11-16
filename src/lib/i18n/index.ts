import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "../types";
import { dictionary, errorKey, translate } from "./translate";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  return jar.get("locale")?.value === "fr" ? "fr" : "en";
}

export async function getI18n() {
  const locale = await getLocale();
  const dict = dictionary(locale);
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(dict, key, vars);
  return { locale, dict, t };
}

export { dictionary, translate, errorKey };
