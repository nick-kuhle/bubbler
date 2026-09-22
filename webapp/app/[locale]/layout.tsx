import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import UtcClock from "@/components/UtcClock";
import { Link, Lang, t, UTC_NOTE } from "@/lib/i18n";
import { routing } from "@/src/i18n/routing";

import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // iScout-style: a canonical URL per language + hreflang alternates for every locale.
  return {
    title: "bubbler",
    description:
      "Hands-off peace-shield keeper for our Evony circle — bubbles open on schedule, so nobody's city burns while we're asleep.",
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        en: `${baseUrl}/en`,
        es: `${baseUrl}/es`,
        "x-default": `${baseUrl}/en`,
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = locale as Lang;
  const messages = await getMessages();
  const dict = t(lang);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
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
            <div className="shell-end">
              <UtcClock />
              <span className="utc-note">{UTC_NOTE}</span>
              <LanguageSwitcher />
            </div>
          </header>
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}