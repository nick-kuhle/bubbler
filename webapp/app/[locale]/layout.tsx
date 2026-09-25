import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import SiteChrome from "@/components/SiteChrome";
import { isRtlLocale, routing } from "@/src/i18n/routing";

import "../globals.css";

// Self-hosted via @fontsource (bundled at build time — no Google Fonts fetch,
// so builds work offline and pages never wait on a font CDN). Latin subsets only;
// non-Latin scripts (العربية, 中文, 日本語, 한국어, हिन्दी, Русский) gracefully
// fall back to the system font stack for the display face.
const display = localFont({
  src: [
    { path: "../../node_modules/@fontsource/baloo-2/files/baloo-2-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/baloo-2/files/baloo-2-latin-700-normal.woff2", weight: "700" },
    { path: "../../node_modules/@fontsource/baloo-2/files/baloo-2-latin-800-normal.woff2", weight: "800" },
  ],
  variable: "--font-display",
});

const nunito = localFont({
  src: [
    { path: "../../node_modules/@fontsource/nunito/files/nunito-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/nunito/files/nunito-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/nunito/files/nunito-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/nunito/files/nunito-latin-700-normal.woff2", weight: "700" },
    { path: "../../node_modules/@fontsource/nunito/files/nunito-latin-800-normal.woff2", weight: "800" },
  ],
  variable: "--font-sans",
});

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
  return {
    title: "LOL Bubbler — Alliance Truce Scheduler",
    description:
      "Alliance LOL — we don't take things seriously. Automatic overlapping 3-day Evony bubbles, so nobody's city burns while we're asleep.",
    icons: { icon: "/images/logo.png" },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      // hreflang for every served locale, derived from the one routing list.
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `${baseUrl}/${l}`])),
        "x-default": `${baseUrl}/${routing.defaultLocale}`,
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
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={isRtlLocale(locale) ? "rtl" : "ltr"} className={`${display.variable} ${nunito.variable}`}>
      <body className={nunito.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="bubbles" aria-hidden>
            <span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span />
            <span /><span /><span />
          </div>
          <SiteChrome>{children}</SiteChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
