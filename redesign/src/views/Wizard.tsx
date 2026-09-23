import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge, Btn, Field, Ornate, SectionTitle } from "../components/ui";
import { uid } from "../lib/time";
import type { Lang, Slot, User } from "../lib/types";
import { t } from "../lib/i18n";
import { DEFAULT_SLOTS } from "./Dashboard";

const STEPS = 5;

export default function Wizard({
  lang,
  user,
  onDone,
  setSlots,
}: {
  lang: Lang;
  user: User;
  onDone: () => void;
  setSlots: (s: Slot[]) => void;
}) {
  const w = t(lang).wizard;
  const d = t(lang);
  const [step, setStep] = useState(1);
  const [name, setName] = useState(user.evonyName);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState<"phone" | "code">("phone");
  const [localSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== 2) return;
    const t1 = window.setTimeout(() => setWait("code"), 1800);
    const t2 = window.setTimeout(() => setStep(3), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [step]);

  function start(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setWait("phone");
    setStep(2);
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setStep(4);
    window.setTimeout(() => setStep(5), 1600);
  }

  function confirm() {
    setBusy(true);
    setSlots(localSlots.map((s) => ({ ...s, id: uid() })));
    window.setTimeout(() => {
      setBusy(false);
      setStep(6);
    }, 700);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="mb-5 flex items-center gap-4">
        <img
          src="/images/truce.jpg"
          alt=""
          className="h-16 w-16 rounded-2xl object-cover ring-2 ring-gold/50 sm:h-20 sm:w-20"
        />
        <div>
          <SectionTitle kicker="Truce Agreement" title={w.title} />
          <p className="-mt-3 text-sm text-parchment/70">{w.intro}</p>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-2">
        {Array.from({ length: STEPS }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`h-2.5 flex-1 rounded-full ${
              n < step ? "bg-ok" : n === step ? "bg-pink-lol shadow-[0_0_12px_#ff4d8d]" : "bg-gold/20"
            }`}
          />
        ))}
        <span className="ml-1 shrink-0 text-[11px] font-bold uppercase tracking-widest text-gold/70">
          {w.step} {Math.min(step, STEPS)} {w.of} {STEPS}
        </span>
      </div>

      <Ornate>
        {step === 1 && (
          <form onSubmit={start}>
            <h3 className="font-display text-xl text-gold-bright">{w.s1t}</h3>
            <p className="mt-1 mb-4 text-sm text-parchment/70">{w.s1b}</p>
            <Field label={w.account}>
              <input className="field-input" value={name} placeholder={w.ph} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Btn type="submit" className="w-full">
              {w.start}
            </Btn>
          </form>
        )}

        {step === 2 && (
          <div className="text-center py-4">
            <Loader2 className="mx-auto h-10 w-10 text-cyan-bubble spin" />
            <h3 className="mt-4 font-display text-xl text-gold-bright">{w.s2t}</h3>
            <p className="mt-2 text-sm text-parchment/70">{w.s2b}</p>
            <p className="mt-3 text-sm text-cyan-bubble">
              {wait === "phone" ? w.wait : w.connected}
            </p>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={submitCode}>
            <Badge tone="ok">{w.connected}</Badge>
            <h3 className="mt-3 font-display text-xl text-gold-bright">{w.s3t}</h3>
            <p className="mt-1 mb-4 text-sm text-parchment/70">{w.s3b}</p>
            <Field label={w.code}>
              <input
                className="field-input otp"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
            <Btn type="submit" className="w-full" disabled={code.length !== 6}>
              {w.linkIt}
            </Btn>
          </form>
        )}

        {step === 4 && (
          <div className="text-center py-4">
            <Loader2 className="mx-auto h-10 w-10 text-pink-hot spin" />
            <h3 className="mt-4 font-display text-xl text-gold-bright">{w.s4t}</h3>
            <p className="mt-2 text-sm text-parchment/70">{w.s4b}</p>
          </div>
        )}

        {step === 5 && (
          <div>
            <h3 className="font-display text-xl text-gold-bright">{w.s5t}</h3>
            <p className="mt-1 mb-4 text-sm text-parchment/70">{w.s5b}</p>
            <div className="space-y-2">
              {localSlots.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-gold/20 bg-ink/40 px-3 py-2">
                  <span className="font-bold text-gold">{d.daysFull[s.weekday - 1]}</span>
                  <span className="font-mono text-cyan-bubble">{s.time} UTC</span>
                  <span className="text-xs text-parchment/60">72h · 2,500</span>
                </div>
              ))}
            </div>
            <Btn className="mt-5 w-full" onClick={confirm} disabled={busy}>
              {busy ? d.dash.saving : w.confirm}
            </Btn>
          </div>
        )}

        {step === 6 && (
          <div className="text-center py-2">
            <CheckCircle2 className="mx-auto h-12 w-12 text-ok" />
            <h3 className="mt-3 font-display text-2xl text-gold-bright">{w.s6t}</h3>
            <p className="mt-2 text-sm text-parchment/70">{w.s6b}</p>
            <img src="/images/keep.jpg" alt="" className="mt-4 h-32 w-full rounded-xl object-cover" />
            <Btn className="mt-4 w-full" onClick={onDone}>
              {w.toDash}
            </Btn>
          </div>
        )}
      </Ornate>
    </div>
  );
}
