import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";

export function Ornate({
  children,
  className,
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <div className={cn("ornate rounded-[18px]", className)}>
      <div className={cn("ornate-inner rounded-[18px] h-full", pad && "p-4 sm:p-6")}>{children}</div>
    </div>
  );
}

type BtnVariant = "gold" | "pink" | "cyan" | "ghost";

export function Btn({
  children,
  variant = "gold",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const map: Record<BtnVariant, string> = {
    gold: "btn-gold",
    pink: "btn-pink",
    cyan: "btn-cyan",
    ghost: "btn-ghost",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-extrabold tracking-wide transition disabled:opacity-50 disabled:pointer-events-none active:translate-y-px text-sm sm:text-base",
        map[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "gold",
}: {
  children: ReactNode;
  tone?: "gold" | "ok" | "warn" | "bad" | "pink" | "cyan";
}) {
  const tones = {
    gold: "border-gold/50 text-gold bg-gold/10",
    ok: "border-ok/60 text-ok bg-ok/10",
    warn: "border-warn/60 text-warn bg-warn/10",
    bad: "border-bad/60 text-bad bg-bad/10",
    pink: "border-pink-lol/60 text-pink-hot bg-pink-lol/10",
    cyan: "border-cyan-bubble/60 text-cyan-bubble bg-cyan-bubble/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.16em] text-gold/80">
        {label}
      </span>
      {children}
    </label>
  );
}

export function SectionTitle({
  kicker,
  title,
  right,
}: {
  kicker?: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && (
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-pink-hot">{kicker}</p>
        )}
        <h2 className="font-display text-xl sm:text-2xl font-bold title-gold">{title}</h2>
      </div>
      {right}
    </div>
  );
}
