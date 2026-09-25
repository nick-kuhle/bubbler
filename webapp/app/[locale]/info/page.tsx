import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { routing } from "@/src/i18n/routing";

export default async function Info({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("info");
  const cards = [
    { icon: "🛡️", cls: "", title: t("bubbles"), body: t("bubblesBody") },
    { icon: "📅", cls: "sun", title: t("defaultTitle"), body: t("defaultBody") },
    { icon: "🌎", cls: "green", title: t("i18nTitle"), body: t("i18nBody") },
    { icon: "🔒", cls: "", title: t("private"), body: t("privateBody") },
  ];

  return (
    <>
      <section className="hero-banner">
        <img src="/images/sky-hero.jpg" alt="" className="cover" />
        <div className="veil" />
        <div className="copy">
          <p className="kicker">Alliance LOL</p>
          <h1 className="title-pop font-display" style={{ margin: "0.2rem 0 0", fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
            {t("title")}
          </h1>
          <p className="muted" style={{ maxWidth: 640 }}>{t("intro")}</p>
        </div>
      </section>

      <div className="info-grid">
        {cards.map((c) => (
          <article key={c.title} className="card info-card">
            <span className={`tile ${c.cls}`.trim()} aria-hidden>{c.icon}</span>
            <div className="pad">
              <h3>{c.title}</h3>
              <p className="muted">{c.body}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
