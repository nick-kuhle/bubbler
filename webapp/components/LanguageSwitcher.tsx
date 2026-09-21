// components/LanguageSwitcher.tsx — tiny client island: writes the lang cookie and
// reloads, matching the nav's lang switcher. The layout renders it; pages never import it.

"use client";

import { useRouter } from "next/navigation";
import { SUPPORTED, LANG_COOKIE } from "@/lib/i18n";

export default function LanguageSwitcher({ current }: { current: string }) {
  const router = useRouter();
  return (
    <label className="switcher">
      <span className="muted">🌍 language</span>
      <select
        value={current}
        onChange={(e) => {
          document.cookie = `${LANG_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
      >
        {SUPPORTED.map((l) => (
          <option key={l} value={l}>
            {l === "es" ? "español" : "english"}
          </option>
        ))}
      </select>
    </label>
  );
}
