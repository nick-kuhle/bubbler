// src/i18n/request.ts — per-request i18n config consumed by next-intl's server APIs.
import { getRequestConfig } from "next-intl/server";

import en from "../../messages/en.json";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && routing.locales.includes(requested as (typeof routing.locales)[number])
      ? requested
      : routing.defaultLocale;

  // iScout rule: the EN string is the dictionary key, so a locale with no real
  // translation falls back to English. Guard the import so untranslated locales
  // render English instead of throwing. Type is pinned to the en dict shape from
  // a static import (so next-intl sees a real DeepPartial, not `unknown`).
  let messages: typeof en;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = en;
  }

  return { locale, messages };
});
