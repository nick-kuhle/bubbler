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
  const cards = [
    { icon: "🛡️", cls: "", title: dict.info.bubbles, body: dict.info.bubblesBody },
    { icon: "📅", cls: "sun", title: dict.info.defaultTitle, body: dict.info.defaultBody },
    { icon: "🌎", cls: "green", title: dict.info.i18nTitle, body: dict.info.i18nBody },
    { icon: "🔒", cls: "", title: dict.info.private, body: dict.info.privateBody },
  ];

  return (
    <>
      <section className="hero-banner">
        <img src="/images/sky-hero.jpg" alt="" className="cover" />
        <div className="veil" />
        <div className="copy">
          <p className="kicker">Alliance LOL</p>
          <h1 className="title-pop font-display" style={{ margin: "0.2rem 0 0", fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
            {dict.info.title}
          </h1>
          <p className="muted" style={{ maxWidth: 640 }}>{dict.info.intro}</p>
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
