// src/i18n/routing.ts — the ONE place that knows which languages bubbler serves.
//
// Adding a language:
//   1. add its code + native label here
//   2. create messages/<code>.json (tip: `npm run i18n` machine-translates every
//      missing catalog from en.json, and `npm run i18n:check` verifies parity)
// That's it — middleware, static params, the switcher and SEO hreflang tags all
// derive from this list. No other file needs to change.

import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // "en" first (the default), the rest alphabetical by code.
  locales: [
    "en",
    "ar",
    "da",
    "de",
    "es",
    "fil",
    "fr",
    "hi",
    "id",
    "it",
    "ja",
    "ko",
    "ms",
    "nb",
    "nl",
    "pt",
    "ro",
    "ru",
    "sv",
    "tr",
    "vi",
    "zh-CN",
  ],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

/** Language names in themselves (what the switcher shows). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  da: "Dansk",
  de: "Deutsch",
  es: "Español",
  fil: "Filipino",
  fr: "Français",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  ms: "Bahasa Melayu",
  nb: "Norsk",
  nl: "Nederlands",
  pt: "Português",
  ro: "Română",
  ru: "Русский",
  sv: "Svenska",
  tr: "Türkçe",
  vi: "Tiếng Việt",
  "zh-CN": "简体中文",
};

/** Right-to-left languages (Arabic). Drives <html dir="rtl">. */
export const RTL_LOCALES: ReadonlySet<string> = new Set(["ar"]);

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}
