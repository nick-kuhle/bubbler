// components/LanguageSwitcher.tsx — client island. One option per locale showing the
// native-language name (English · العربية · Dansk · …). Switching pushes the same
// pathname under the new canonical /<locale>/… prefix — no cookies, no page reload
// dance. The list itself comes from src/i18n/routing.ts, so new languages show up
// here automatically.

"use client";

import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/src/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/src/i18n/routing";

export default function LanguageSwitcher() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label
      className="switcher"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        color: "var(--muted)",
        fontSize: "0.85rem",
      }}
    >
      <span style={{ opacity: 0.9 }}>{t("common.language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          router.push(pathname, { locale: next });
        }}
        style={{
          appearance: "none",
          background:
            "var(--card) url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238b96a5' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\") no-repeat",
          backgroundPosition: "right 0.6rem center",
          backgroundSize: "0.6rem",
          border: "1px solid var(--edge)",
          borderRadius: "8px",
          color: "var(--text)",
          padding: "0.45rem 1.7rem 0.45rem 0.7rem",
          fontSize: "0.9rem",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
