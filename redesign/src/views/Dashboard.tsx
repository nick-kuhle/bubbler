import { useEffect, useMemo, useState } from "react";
import { Check, Gem, Play, Plus, Trash2 } from "lucide-react";
import { Badge, Btn, Field, Ornate, SectionTitle } from "../components/ui";
import { ShieldRing } from "../components/Chrome";
import { countdown, nextFromSlots, uid } from "../lib/time";
import type { Lang, Run, Slot, User } from "../lib/types";
import { t } from "../lib/i18n";

const DEFAULT_SLOTS = (): Slot[] => [
  { id: uid(), weekday: 1, time: "09:00", shieldHours: 72, active: true },
  { id: uid(), weekday: 3, time: "09:00", shieldHours: 72, active: true },
  { id: uid(), weekday: 5, time: "18:00", shieldHours: 72, active: true },
];

export default function Dashboard({
  lang,
  user,
  setUser,
  slots,
  setSlots,
  lastRun,
  onRunNow,
  onRelink,
  runMsg,
  runBusy,
}: {
  lang: Lang;
  user: User;
  setUser: (u: User) => void;
  slots: Slot[];
  setSlots: (s: Slot[]) => void;
  lastRun: Run | null;
  onRunNow: () => void;
  onRelink: () => void;
  runMsg: string | null;
  runBusy: boolean;
}) {
  const d = t(lang);
  const dd = d.dash;
  const [now, setNow] = useState(Date.now());
  const [gemAck, setGemAck] = useState(true);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [name, setName] = useState(user.evonyName);
  const [email, setEmail] = useState(user.email);

  const enabled = slots.some((s) => s.active);
  const nextTs = useMemo(() => nextFromSlots(slots), [slots]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining =
    lastRun?.status === "ok" && lastRun.shieldHoursRemaining != null
      ? Math.max(
          0,
          lastRun.shieldHoursRemaining - (now - new Date(lastRun.createdAt).getTime()) / 3600000,
        )
      : 0;

  function save() {
    if (!slots.length) {
      setEditMsg(dd.saveError);
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setEditMsg(dd.saved);
    }, 500);
  }

  function toggle() {
    setSlots(slots.map((s) => ({ ...s, active: !enabled })));
    setEditMsg(dd.saved);
  }

  function saveProfile() {
    setUser({ ...user, evonyName: name, email });
    setProfileMsg(dd.profileSaved);
  }

  const nextSlot = slots
    .filter((s) => s.active)
    .map((s) => ({ s, ts: nextFromSlots([s]) }))
    .sort((a, b) => a.ts - b.ts)[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
      <div className="relative mb-5 overflow-hidden rounded-[22px] border border-gold/40 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        <img src="/images/keep.jpg" alt="" className="h-48 w-full object-cover sm:h-64" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/55 to-ink/30" />
        <div className="absolute inset-0 flex flex-col justify-between p-4 sm:flex-row sm:items-end sm:p-6">
          <div className="flex items-end gap-3">
            <img
              src="/images/general.jpg"
              alt=""
              className="hidden h-16 w-16 rounded-full object-cover ring-2 ring-gold/80 shadow-lg sm:block"
            />
            <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-pink-hot">
              {user.isOperator ? dd.operator : dd.member} · {user.evonyName}
            </p>
            <h1 className="font-display text-3xl font-black title-gold sm:text-4xl">{dd.title}</h1>
            <p className="mt-1 max-w-md text-sm text-parchment/80">{dd.intro}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={remaining > 1 ? "ok" : "warn"}>{remaining > 1 ? dd.shieldOn : dd.shieldOff}</Badge>
              <Badge tone="pink">{dd.gems}</Badge>
              <Badge tone="cyan">{dd.shield72}</Badge>
            </div>
            </div>
          </div>
          <div className="mt-3 self-end sm:mt-0">
            <ShieldRing hours={remaining} />
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          {
            img: "/images/gem.png",
            label: dd.gems,
            value: "2,500",
          },
          {
            img: "/images/truce.jpg",
            label: dd.remaining,
            value: remaining > 0 ? `${remaining.toFixed(1)}h` : "—",
          },
          {
            img: "/images/logo.png",
            label: dd.next,
            value: nextTs ? countdown(nextTs - now) : dd.never,
          },
        ].map((x) => (
          <Ornate key={x.label} pad={false}>
            <div className="flex items-center gap-3 p-3">
              <img src={x.img} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-gold/40" />
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gold/70">{x.label}</p>
                <p className="truncate font-display text-lg font-bold text-gold-bright tabular-nums">{x.value}</p>
              </div>
            </div>
          </Ornate>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <Ornate>
            <SectionTitle
              kicker="Schedule"
              title={dd.slots}
              right={
                <Btn variant={enabled ? "ghost" : "cyan"} className="!py-1.5 !text-xs" onClick={toggle}>
                  {enabled ? dd.toggleOff : dd.toggleOn}
                </Btn>
              }
            />
            <div className="space-y-3">
              {slots.map((s, i) => (
                <div
                  key={s.id}
                  className="flex flex-col gap-2 rounded-xl border border-gold/20 bg-ink/40 p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {d.days.map((day, di) => (
                      <button
                        key={day}
                        onClick={() =>
                          setSlots(slots.map((x) => (x.id === s.id ? { ...x, weekday: di + 1 } : x)))
                        }
                        className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                          s.weekday === di + 1
                            ? "bg-pink-lol text-white shadow-[0_0_12px_rgba(255,77,141,0.45)]"
                            : "border border-gold/25 text-parchment/60"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <input
                    type="time"
                    value={s.time}
                    onChange={(e) =>
                      setSlots(slots.map((x) => (x.id === s.id ? { ...x, time: e.target.value } : x)))
                    }
                    className="field-input !w-auto sm:ml-auto"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-parchment/70">
                    <input
                      type="checkbox"
                      checked={s.active}
                      onChange={(e) =>
                        setSlots(slots.map((x) => (x.id === s.id ? { ...x, active: e.target.checked } : x)))
                      }
                    />
                    {dd.on}
                  </label>
                  <button
                    className="text-pink-hot"
                    onClick={() => setSlots(slots.filter((x) => x.id !== s.id))}
                    aria-label={dd.remove}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <span className="hidden text-[10px] text-parchment/40 sm:inline">#{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Btn
                variant="ghost"
                className="!py-1.5 !text-xs"
                onClick={() =>
                  setSlots([...slots, { id: uid(), weekday: 1, time: "09:00", shieldHours: 72, active: true }])
                }
              >
                <Plus className="h-4 w-4" /> {dd.add}
              </Btn>
              <label className="flex items-start gap-2 text-xs text-parchment/70 sm:ml-2">
                <input type="checkbox" checked={gemAck} onChange={(e) => setGemAck(e.target.checked)} />
                {dd.gemAck}
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Btn onClick={save} disabled={saving || !gemAck}>
                {saving ? dd.saving : dd.save}
              </Btn>
              {editMsg && <span className="text-sm text-ok">{editMsg}</span>}
            </div>
          </Ornate>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Ornate>
            <SectionTitle kicker="Command" title={dd.next} />
            <p className="font-display text-2xl font-bold text-gold-bright tabular-nums">
              {nextTs ? (
                <>
                  {dd.in} {countdown(nextTs - now)}
                </>
              ) : (
                dd.never
              )}
            </p>
            {nextSlot && (
              <p className="mt-1 text-sm text-parchment/60">
                {d.daysFull[nextSlot.s.weekday - 1]} · {nextSlot.s.time} UTC
              </p>
            )}
            <Btn className="mt-4 w-full" variant="pink" onClick={onRunNow} disabled={runBusy}>
              <Play className="h-4 w-4" /> {runBusy ? dd.running : dd.runNow}
            </Btn>
            {runMsg && <p className="mt-2 text-sm text-cyan-bubble">{runMsg}</p>}
            <p className="mt-2 text-[11px] text-parchment/45">{dd.results}</p>
          </Ornate>

          <Ornate pad={false}>
            <div className="p-4">
              <SectionTitle kicker="Ledger" title={dd.last} />
              {lastRun ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge tone={lastRun.status === "ok" ? "ok" : lastRun.status === "queued" ? "warn" : "bad"}>
                      {lastRun.status}
                    </Badge>
                    <span className="text-xs text-parchment/55">
                      {lastRun.kind} · {lastRun.createdAt.slice(0, 16).replace("T", " ")} UTC
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-parchment/70">
                    {dd.remaining}: {lastRun.shieldHoursRemaining ?? "—"}h
                  </p>
                </>
              ) : (
                <p className="text-sm text-parchment/55">{dd.neverRun}</p>
              )}
            </div>
            <img src="/images/keep.jpg" alt={dd.evidence} className="h-36 w-full object-cover" />
            <p className="px-4 py-2 text-[10px] uppercase tracking-widest text-gold/60">{dd.evidence}</p>
          </Ornate>

          <Ornate>
            <SectionTitle kicker="Identity" title={dd.profile} />
            <p className="mb-3 text-xs text-parchment/60">{dd.profileBody}</p>
            <Field label={dd.name}>
              <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={dd.email}>
              <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={saveProfile} className="!py-2 !text-sm">
                <Check className="h-4 w-4" /> {dd.saveProfile}
              </Btn>
              <Btn variant="ghost" className="!py-2 !text-sm" onClick={onRelink}>
                {dd.unlink}
              </Btn>
            </div>
            {profileMsg && <p className="mt-2 text-sm text-ok">{profileMsg}</p>}
            <p className="mt-3 inline-flex items-center gap-1 text-xs text-parchment/50">
              <Gem className="h-3.5 w-3.5 text-pink-hot" /> {dd.gems} · {dd.shield72}
            </p>
          </Ornate>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_SLOTS };
