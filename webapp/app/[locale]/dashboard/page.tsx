import { setRequestLocale } from "next-intl/server";

import Dashboard from "@/components/Dashboard";
import { Lang, t } from "@/lib/i18n";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Dashboard dict={t(locale as Lang)} />;
}