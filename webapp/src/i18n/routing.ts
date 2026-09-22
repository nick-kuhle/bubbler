// src/i18n/routing.ts — locale routing for bubbler. Locales ordered en first, es second.
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "always",
});
