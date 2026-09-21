// app/layout.tsx — shared shell. Brand + nav come from the i18n dict for the language
// picked via the switcher (cookie: LANG_COOKIE, default en). Server component: reads the
// cookie, resolves the dict, renders the switcher as a tiny client island.

import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import { t, isLang, Lang, LANG_COOKIE } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export const metadata = {
  title: "Sister's Automatic Bubble App",
  description: "Hands-off peace-shield keeper for our Evony circle — bubbles open on schedule, so nobody's city burns while we're asleep.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const rawLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(rawLang) ? rawLang : "en";
  const dict = t(lang);

  return (
    <html lang={lang}>
      <body>
        <header className="shell">
          <Link href="/" className="brand">
            {dict.brandShort}
          </Link>
          <nav>
            <Link href="/dashboard">{dict.nav.dashboard}</Link>
            <Link href="/master">{dict.nav.master}</Link>
            <Link href="/wizard">{dict.nav.wizard}</Link>
            <Link href="/info">{dict.nav.info}</Link>
          </nav>
          <LanguageSwitcher current={lang} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
