// global.d.ts — wires next-intl to OUR locale list and OUR en.json shape, so
// useTranslations("...") has key autocompletion + compile-time key checking, and
// hasLocale()/useLocale() know the exact union of supported locales.
import { routing } from "@/src/i18n/routing";

import en from "../../messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof en;
  }
}
