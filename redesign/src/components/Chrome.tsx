import { useEffect, useState } from "react";
import {
  Castle,
  Crown,
  Languages,
  LogOut,
  Menu,
  ScrollText,
  Shield,
  Swords,
  X,
} from "lucide-react";
import { Btn } from "./ui";
import { cn } from "../utils/cn";
import type { Lang, User, View } from "../lib/types";
import { t } from "../lib/i18n";

export function Bubbles() {
  return (
    <div className="bubbles" aria-hidden>
      {Array.from({ length: 15 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function UtcClock({ label }: { label: string }) {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 rounded-full border border-gold/40 bg-ink/70 px-3 py-1 font-mono text-xs tracking-wider text-gold-bright">
      <span className="tabular-nums">{now}</span>
      <span className="text-[10px] uppercase tracking-widest text-gold/70">UTC</span>
      <span className="hidden sm:inline text-[10px] text-parchment/50">· {label}</span>
    </div>
  );
}

const NAV: { id: View; icon: typeof Castle; key: "keep" | "link" | "war" | "intel"; op?: boolean }[] = [
  { id: "dashboard", icon: Castle, key: "keep" },
  { id: "wizard", icon: ScrollText, key: "link" },
  { id: "master", icon: Swords, key: "war", op: true },
  { id: "info", icon: Shield, key: "intel" },
];

export function Header({
  lang,
  setLang,
  view,
  setView,
  user,
  onOut,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  view: View;
  setView: (v: View) => void;
  user: User | null;
  onOut: () => void;
}) {
  const d = t(lang);
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.op || user?.isOperator);

  return (
    <header className="sticky top-0 z-40 border-b border-gold/30 bg-[#12080f]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5">
        <button
          onClick={() => setView(user ? "dashboard" : "login")}
          className="flex min-w-0 items-center gap-2.5"
        >
          <img
            src="/images/logo.png"
            alt="LOL Bubbler"
            className="h-11 w-11 shrink-0 rounded-full object-cover shadow-[0_0_18px_rgba(232,197,107,0.45)] ring-2 ring-gold/70"
          />
          <span className="min-w-0 text-left">
            <span className="mr-1.5 inline-block -rotate-6 rounded-full bg-pink-lol px-1.5 py-[1px] text-[10px] font-black tracking-widest text-white shadow-[2px_2px_0_#ffb703]">
              LOL
            </span>
            <span className="font-display text-lg font-extrabold title-gold sm:text-xl">{d.brand}</span>
          </span>
        </button>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
            {(user ? items : NAV.filter((n) => n.id === "info")).map((n) => {
              const Icon = n.icon;
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold transition",
                    active
                      ? "bg-gold/15 text-gold-bright ring-1 ring-gold/50"
                      : "text-parchment/70 hover:text-gold",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {d.nav[n.key]}
                </button>
              );
            })}
          </nav>

        <div className="ml-auto flex items-center gap-2">
          <UtcClock label={d.utc} />
          <button
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            className="hidden sm:inline-flex items-center gap-1 rounded-full border border-gold/30 bg-ink/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gold"
            aria-label={d.lang}
          >
            <Languages className="h-3.5 w-3.5" />
            {lang === "en" ? "EN" : "ES"}
          </button>
          {user && (
            <>
              <span className="hidden lg:inline-flex items-center gap-1 text-xs text-parchment/70">
                {user.isOperator ? <Crown className="h-3.5 w-3.5 text-gold" /> : null}
                {user.evonyName}
              </span>
              <Btn variant="ghost" className="hidden !px-3 !py-1.5 text-xs md:inline-flex" onClick={onOut}>
                <LogOut className="h-3.5 w-3.5" />
                {d.nav.out}
              </Btn>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gold/40 text-gold md:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-label="menu"
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          )}
          {!user && (
            <button
              onClick={() => setLang(lang === "en" ? "es" : "en")}
              className="sm:hidden inline-flex items-center rounded-full border border-gold/30 px-2.5 py-1 text-[11px] font-bold text-gold"
            >
              {lang === "en" ? "EN" : "ES"}
            </button>
          )}
        </div>
      </div>

      {open && user && (
        <div className="border-t border-gold/20 bg-ink/95 px-3 py-3 md:hidden">
          <div className="grid grid-cols-2 gap-2">
            {items.map((n) => {
              const Icon = n.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setView(n.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-extrabold",
                    view === n.id
                      ? "border-gold/60 bg-gold/15 text-gold-bright"
                      : "border-gold/20 text-parchment/80",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {d.nav[n.key]}
                </button>
              );
            })}
            <button
              onClick={() => {
                setLang(lang === "en" ? "es" : "en");
              }}
              className="flex items-center gap-2 rounded-xl border border-gold/20 px-3 py-3 text-sm font-extrabold text-parchment/80"
            >
              <Languages className="h-4 w-4" />
              {lang === "en" ? "English" : "Español"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onOut();
              }}
              className="flex items-center gap-2 rounded-xl border border-pink-lol/40 px-3 py-3 text-sm font-extrabold text-pink-hot"
            >
              <LogOut className="h-4 w-4" />
              {d.nav.out}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export function BottomNav({
  view,
  setView,
  user,
  lang,
}: {
  view: View;
  setView: (v: View) => void;
  user: User | null;
  lang: Lang;
}) {
  if (!user) return null;
  const d = t(lang);
  const items = NAV.filter((n) => !n.op || user.isOperator);
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-gold/30 bg-[#12080f]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((n) => {
          const Icon = n.icon;
          const active = view === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-extrabold uppercase tracking-wider",
                active ? "text-gold-bright" : "text-parchment/55",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_rgba(232,197,107,0.8)]")} />
              {d.nav[n.key]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function Footer({ lang }: { lang: Lang }) {
  const d = t(lang);
  return (
    <footer className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-8 text-center md:pb-10">
      <p className="mx-auto max-w-2xl text-[11px] leading-relaxed text-parchment/50">{d.privacy}</p>
      <p className="mt-2 font-display text-[10px] tracking-[0.25em] text-gold/50">ALLIANCE LOL · KEEP THE BUBBLES UP</p>
    </footer>
  );
}

export function ShieldRing({ hours, max = 72 }: { hours: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, hours / max));
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 sm:h-32 sm:w-32 shield-glow">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(232,197,107,0.18)" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="url(#sg)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7ad7ff" />
          <stop offset="55%" stopColor="#ff4d8d" />
          <stop offset="100%" stopColor="#f8e7a0" />
        </linearGradient>
      </defs>
      <text x="50" y="48" textAnchor="middle" fill="#f8e7a0" fontSize="16" fontWeight="800" fontFamily="Cinzel, serif">
        {hours.toFixed(0)}h
      </text>
      <text x="50" y="64" textAnchor="middle" fill="#7ad7ff" fontSize="8" fontWeight="700" letterSpacing="1.5">
        SHIELD
      </text>
    </svg>
  );
}
