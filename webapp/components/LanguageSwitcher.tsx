// components/LanguageSwitcher.tsx — tiny client island: the iScout-native-name dropdown.
// Rows show each language by its OWN native name (English · Español · …), read straight
// from the dictionary's NATIVE/SUPPORTED maps, so adding a language = one dict block.
// Writes the lang cookie and refreshes; the server layout re-reads it and re-renders.

"use client";

import { useRouter } from "next/navigation";
import { SUPPORTED, NATIVE, LANG_COOKIE } from "@/lib/i18n";

export default function LanguageSwitcher({ current }: { current: string }) {
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
      <span style={{ opacity: 0.9 }}>language</span>
      <select
        value={current}
        onChange={(e) => {
          document.cookie = `${LANG_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
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
        {SUPPORTED.map((l) => (
          <option key={l} value={l}>
            {NATIVE[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
