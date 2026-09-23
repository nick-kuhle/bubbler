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
    { title: dict.info.bubbles, body: dict.info.bubblesBody, img: "/images/truce.jpg" },
    { title: dict.info.defaultTitle, body: dict.info.defaultBody, img: "/images/keep.jpg" },
    { title: dict.info.i18nTitle, body: dict.info.i18nBody, img: "/images/banner.jpg" },
    { title: dict.info.private, body: dict.info.privateBody, img: "/images/general.jpg" },
  ];

  return (
    <>
      <section className="hero-banner">
        <img src="/images/banner.jpg" alt="" className="cover" />
        <div className="veil" />
        <div className="copy">
          <p className="kicker">Alliance LOL</p>
          <h1 className="title-gold font-display" style={{ margin: "0.2rem 0 0", fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
            {dict.info.title}
          </h1>
          <p className="muted" style={{ maxWidth: 640 }}>{dict.info.intro}</p>
        </div>
      </section>

      <div className="info-grid">
        {cards.map((c) => (
          <article key={c.title} className="card info-card">
            <img src={c.img} alt="" />
            <div className="pad">
              <h3 style={{ margin: "0 0 0.35rem" }}>{c.title}</h3>
              <p className="muted" style={{ margin: 0 }}>{c.body}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
