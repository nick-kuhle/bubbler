// src/i18n/routing.ts — locale routing for bubbler. Locales ordered to match the
// iScout.club switcher (en default + Spanish first, then the rest in native order).
// The key insight that keeps this small: the EN string is the dictionary key, so any
// locale without a real translation simply falls back to English. Adding a locale =
// one entry here + (optionally) a messages/<code>.json override.
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: [
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
  ],
  defaultLocale: "en",
  localePrefix: "always",
});
