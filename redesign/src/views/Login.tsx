import { FormEvent, useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { Btn, Field, Ornate } from "../components/ui";
import type { Lang, User } from "../lib/types";
import { t } from "../lib/i18n";

export default function Login({
  lang,
  onEnter,
  onIntel,
}: {
  lang: Lang;
  onEnter: (u: User) => void;
  onIntel: () => void;
}) {
  const d = t(lang);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const local = email.split("@")[0] || "PinkKeep";
    const isOperator = /op|nick|operator/i.test(email);
    window.setTimeout(() => {
      onEnter({
        email,
        evonyName: local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "PinkKeep",
        isOperator,
      });
    }, 700);
  }

  return (
    <div className="relative min-h-[calc(100dvh-4.5rem)]">
      <img
        src="/images/hero.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/55 to-ink/90" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 py-8 sm:py-14">
        <img
          src="/images/logo.png"
          alt="LOL Bubbler crest"
          className="h-28 w-28 sm:h-36 sm:w-36 rounded-full object-cover ring-4 ring-gold/70 shadow-[0_0_50px_rgba(232,197,107,0.45)] shield-glow"
        />

        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-pink-lol/50 bg-pink-lol/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-pink-hot">
          <Sparkles className="h-3.5 w-3.5" />
          Alliance LOL
        </p>
        <h1 className="mt-3 text-center font-display text-4xl font-black title-gold sm:text-6xl">
          {d.brand}
        </h1>
        <p className="mt-3 max-w-xl text-center text-sm text-parchment/85 sm:text-base">{d.tagline}</p>
        <p className="mt-2 max-w-lg text-center text-xs text-parchment/60 sm:text-sm">{d.sub}</p>

        <Ornate className="mt-8 w-full max-w-md">
          <form onSubmit={submit}>
            <Field label={d.login.email}>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/60" />
                <input
                  className="field-input pl-10"
                  type="email"
                  required
                  autoFocus
                  placeholder={d.login.placeholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </Field>
            <Btn type="submit" className="w-full py-3 text-base" disabled={busy}>
              {busy ? d.login.busy : d.login.enter}
            </Btn>
            <p className="mt-3 text-center text-[11px] text-parchment/55">{d.login.hint}</p>
            <p className="mt-1 text-center text-[11px] text-cyan-bubble/80">{d.login.demo}</p>
            <button
              type="button"
              onClick={onIntel}
              className="mt-4 w-full text-center text-xs font-extrabold uppercase tracking-[0.18em] text-gold hover:text-gold-bright"
            >
              {d.nav.intel} →
            </button>
          </form>
        </Ornate>

        <div className="mt-8 grid w-full max-w-3xl grid-cols-3 gap-3">
          {[
            { img: "/images/gem.png", cap: "2,500 💎" },
            { img: "/images/truce.jpg", cap: "72h truce" },
            { img: "/images/keep.jpg", cap: "No lapse" },
          ].map((x) => (
            <div key={x.cap} className="overflow-hidden rounded-2xl border border-gold/30 bg-ink/50 shadow-lg">
              <img src={x.img} alt="" className="h-20 w-full object-cover sm:h-28" />
              <p className="py-1.5 text-center text-[10px] font-extrabold uppercase tracking-widest text-gold">
                {x.cap}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
