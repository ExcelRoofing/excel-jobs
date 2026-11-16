"use client";

import { createContext, useContext } from "react";
import type { Dict, DictKey } from "@/lib/i18n/en";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/types";

const Ctx = createContext<{ locale: Locale; t: (key: DictKey, vars?: Record<string, string | number>) => string }>({
  locale: "en",
  t: (key) => key,
});

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: React.ReactNode }) {
  const t = (key: DictKey, vars?: Record<string, string | number>) => translate(dict, key, vars);
  return <Ctx.Provider value={{ locale, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
