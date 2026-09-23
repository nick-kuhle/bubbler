import type { Metadata } from "next";
import { Cinzel, Nunito } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import SiteChrome from "@/components/SiteChrome";
import { Lang, t } from "@/lib/i18n";
import { routing } from "@/src/i18n/routing";

import "../globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-display",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
  const messages = await getMessages();
  const dict = t(locale as Lang);

  return (
    <html lang={locale} className={`${cinzel.variable} ${nunito.variable}`}>
      <body className={nunito.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="bubbles" aria-hidden>
            <span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span />
            <span /><span /><span />
          </div>
          <div className="grain" />
          <SiteChrome dict={dict}>{children}</SiteChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
