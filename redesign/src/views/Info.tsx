import { Clock, Globe, Lock, Shield } from "lucide-react";
import { Ornate, SectionTitle } from "../components/ui";
import type { Lang } from "../lib/types";
import { t } from "../lib/i18n";

export default function Info({ lang }: { lang: Lang }) {
  const d = t(lang).info;
  const cards = [
    { icon: Shield, title: d.bubbles, body: d.bubblesBody, img: "/images/truce.jpg" },
    { icon: Clock, title: d.defaultTitle, body: d.defaultBody, img: "/images/keep.jpg" },
    { icon: Globe, title: d.i18nTitle, body: d.i18nBody, img: "/images/banner.jpg" },
    { icon: Lock, title: d.private, body: d.privateBody, img: "/images/general.jpg" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="relative mb-8 overflow-hidden rounded-[22px] border border-gold/40 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <img src="/images/banner.jpg" alt="Alliance LOL banner" className="h-48 w-full object-cover sm:h-72" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-pink-hot">Alliance LOL</p>
          <h1 className="font-display text-3xl font-black title-gold sm:text-5xl">{d.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-parchment/85">{d.intro}</p>
        </div>
      </div>

      <SectionTitle kicker="Intel" title={d.title} />

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Ornate key={c.title} pad={false}>
              <div className="flex flex-col sm:flex-row">
                <img src={c.img} alt="" className="h-36 w-full object-cover sm:h-auto sm:w-40" />
                <div className="p-4 sm:p-5">
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-gold-bright">{c.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-parchment/75">{c.body}</p>
                </div>
              </div>
            </Ornate>
          );
        })}
      </div>
    </div>
  );
}
