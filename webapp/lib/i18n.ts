// lib/i18n.ts — thin shim over next-intl. The dictionaries now live in
// messages/en.json + messages/es.json; this module re-exports next-intl's helpers
// and keeps the tiny compatibility surface (Dict / t / Lang / GEMS / UTC_NOTE) the
// existing call sites use, so pages and components didn't need to change their shape.

export { getLocale, getTranslations } from "next-intl/server";
export { useLocale, useTranslations } from "next-intl";
export { Link } from "@/src/i18n/navigation";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

export type Lang =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "ru"
  | "ja"
  | "ko"
  | "zh-CN"
  | "zh-TW"
  | "ar"
  | "tr"
  | "pl"
  | "nl"
  | "sv"
  | "uk"
  | "vi"
  | "id"
  | "ms"
  | "th"
  | "hi"
  | "he"
  | "fil";

export const SUPPORTED: Lang[] = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "ja",
  "ko",
  "zh-CN",
  "zh-TW",
  "ar",
  "tr",
  "pl",
  "nl",
  "sv",
  "uk",
  "vi",
  "id",
  "ms",
  "th",
  "hi",
  "he",
  "fil",
];

export const NATIVE: Record<Lang, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
  ja: "日本語",
  ko: "한국어",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ar: "العربية",
  tr: "Türkçe",
  pl: "Polski",
  nl: "Nederlands",
  sv: "Svenska",
  uk: "Українська",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
  th: "ไทย",
  hi: "हिन्दी",
  he: "עברית",
  fil: "Filipino",
};

export const LANG_COOKIE = "bubbler_lang";

export const DEFAULT_LANG: Lang = "en";

export function isLang(v: string | undefined | null): v is Lang {
  return v === "en" || v === "es";
}

type DeepStringify<T> = T extends string ? string : { [K in keyof T]: DeepStringify<T[K]> };

export type Dict = DeepStringify<typeof en>;

// Game economy: a fresh Truce Agreement costs gems (matches Evony's store).
export const GEMS_72H = 2500;

// Every time/delay shown anywhere in the app is real Evony server time = UTC.
export const UTC_NOTE = "All times are shown in Evony server time (UTC).";

/** Compatibility: full dictionary for a locale, same shape call sites already use. */
export function t(lang: Lang): Dict {
  return (lang === "es" ? es : en) as Dict;
}