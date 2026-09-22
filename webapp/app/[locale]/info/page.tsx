import { setRequestLocale } from "next-intl/server";

import { Lang, t } from "@/lib/i18n";

export default async function Info({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = t(locale as Lang);

  return (
    <section className="card">
      <h2>{dict.info.title}</h2>
      <p className="muted">{dict.info.intro}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.bubbles}</h3>
      <p>{dict.info.bubblesBody}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.defaultTitle}</h3>
      <p>{dict.info.defaultBody}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.i18nTitle}</h3>
      <p>{dict.info.i18nBody}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.private}</h3>
      <p>{dict.info.privateBody}</p>
    </section>
  );
}