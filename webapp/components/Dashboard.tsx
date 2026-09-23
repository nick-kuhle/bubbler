"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, type Dict } from "@/lib/i18n";
import UnlinkButton from "@/components/UnlinkButton";
import { GEMS_72H } from "@/lib/i18n";
import SlotsEditor, {
  EditSlot,
  MAX_SLOTS,
  slotFromMe,
  slotsAreValid,
} from "@/components/SlotsEditor";

type MeResponse = {
  ok: boolean;
  user: { id: string; email: string; evony_name: string; is_operator: boolean };
  slots: Array<{ id: string; weekday: number; time: string; shield_hours: number; gem_ack: number }>;
  next_run: { weekday: number; time: string } | null;
  last_run: {
    status: string;
    shield_hours_remaining: number | null;
    evidence_ref: string | null;
    error: string | null;
    duration_ms: number | null;
    created_at: string;
  } | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; me: MeResponse };

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function nextTarget(weekday: number, time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, hh, mm, 0, 0));
    const wd = ((d.getUTCDay() + 6) % 7) + 1;
    if (wd === weekday && d.getTime() > now.getTime() + 1000) return d.getTime();
  }
  return 0;
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("ok") || s.includes("success") || s.includes("done") || s.includes("linked")) return "status-ok";
  if (s.includes("fail") || s.includes("error")) return "status-bad";
  if (s.includes("pending") || s.includes("run") || s.includes("wait")) return "status-warn";
  return "";
}

export default function Dashboard({ dict }: { dict: Dict }) {
  const d = dict.dashboard;
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [slots, setSlots] = useState<EditSlot[]>([]);
  const [gemAck, setGemAck] = useState(true);
  const [edit, setEdit] = useState<{ busy: boolean; msg: string | null; error: boolean }>({ busy: false, msg: null, error: false });
  const [profile, setProfile] = useState({ email: "", name: "", busy: false, msg: null as string | null, error: false });
  const [run, setRun] = useState<{ busy: boolean; msg: "queued" | "error" | null }>({ busy: false, msg: null });
  const [nowTs, setNowTs] = useState(() => Date.now());

  async function refresh() {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (!r.ok) {
        setLoad({ kind: "error" });
        return;
      }
      const me = (await r.json()) as MeResponse;
      // Keep local edits when the server reports no ACTIVE slots (e.g. the schedule was
      // just toggled off — the rows still exist, inactive, and come back on toggle-on).
      if (me.slots.length > 0) {
        setSlots(me.slots.map(slotFromMe));
        setGemAck(me.slots.every((s) => s.gem_ack === 1));
      }
      setProfile((p) => ({ ...p, email: me.user.email, name: me.user.evony_name }));
      setLoad({ kind: "ready", me });
    } catch {
      setLoad({ kind: "error" });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const me = load.kind === "ready" ? load.me : null;
  // "Schedule on" == at least one ACTIVE slot row in the DB.
  const enabled = (me?.slots.length ?? 0) > 0;
  const next = me?.next_run ?? null;
  const nextTs = useMemo(
    () => (next ? nextTarget(next.weekday, next.time) : 0),
    [next],
  );

  useEffect(() => {
    if (!nextTs) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextTs]);

  const ackGems = GEMS_72H;

  /** Replace-all save: the editor's rows ARE the user's schedule now. */
  async function save(): Promise<boolean> {
    if (!slotsAreValid(slots)) {
      setEdit({ busy: false, msg: slots.length === 0 ? d.emptySlots : d.badTime, error: true });
      return false;
    }
    setEdit({ busy: true, msg: null, error: false });
    try {
      const r = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: slots.map((s) => ({
            weekday: s.weekday,
            time: s.time,
            shield_hours: s.shield_hours,
            active: s.active,
          })),
          shield_hours: slots[0]?.shield_hours ?? 72,
          gem_ack: gemAck,
        }),
      });
      if (!r.ok) {
        setEdit({ busy: false, msg: d.saveError, error: true });
        return false;
      }
      setEdit({ busy: false, msg: d.saved, error: false });
      window.setTimeout(() => void refresh(), 400);
      return true;
    } catch {
      setEdit({ busy: false, msg: d.saveError, error: true });
      return false;
    }
  }

  /** Global toggle = flip `active` on every slot row (no replace). */
  async function toggle() {
    if (enabled) {
      setEdit({ busy: true, msg: null, error: false });
      try {
        const r = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: false }),
        });
        setEdit({ busy: false, msg: r.ok ? d.saved : d.saveError, error: !r.ok });
        window.setTimeout(() => void refresh(), 400);
      } catch {
        setEdit({ busy: false, msg: d.saveError, error: true });
      }
      return;
    }
    // Turning back ON re-persists the editor's rows as active (replace-all).
    await save();
  }

  async function saveProfile() {
    setProfile((p) => ({ ...p, busy: true, msg: null, error: false }));
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: profile.email, evony_name: profile.name }),
      });
      if (r.status === 409) {
        setProfile((p) => ({ ...p, busy: false, msg: d.profileEmailTaken, error: true }));
        return;
      }
      if (!r.ok) {
        setProfile((p) => ({ ...p, busy: false, msg: d.profileError, error: true }));
        return;
      }
      setProfile((p) => ({ ...p, busy: false, msg: d.profileSaved, error: false }));
      window.setTimeout(() => void refresh(), 300);
    } catch {
      setProfile((p) => ({ ...p, busy: false, msg: d.profileError, error: true }));
    }
  }

  async function runNow() {
    setRun({ busy: true, msg: null });
    try {
      const r = await fetch("/api/runs/now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) {
        setRun({ busy: false, msg: "error" });
        return;
      }
      setRun({ busy: false, msg: "queued" });
      window.setTimeout(() => void refresh(), 2500);
    } catch {
      setRun({ busy: false, msg: "error" });
    }
  }

  if (load.kind === "loading") {
    return (
      <section className="card" style={{ maxWidth: 620, margin: "4rem auto" }}>
        <p className="muted">{d.loading}</p>
      </section>
    );
  }

  if (load.kind === "error" || !me) {
    return (
      <section className="card" style={{ maxWidth: 620, margin: "4rem auto" }}>
        <h2>{d.loadError}</h2>
        <p className="muted">{d.notSignedIn}</p>
        <div className="row" style={{ marginTop: "1rem" }}>
          <Link className="btn" href="/">{d.signIn}</Link>
          <Link className="btn" href="/wizard">{d.goWizard}</Link>
          <button onClick={() => { setLoad({ kind: "loading" }); void refresh(); }}>{d.retry}</button>
        </div>
      </section>
    );
  }

  const roleBadge = me.user.is_operator ? d.roleOperator : d.roleMember;

  return (
    <section className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <section className="card">
        <div className="hsplit">
          <div>
            <h2 style={{ marginBottom: "0.2rem" }}>{d.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{d.intro}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="badge">{roleBadge}</span>
            {me.user.evony_name && <p className="muted" style={{ margin: "0.25rem 0 0" }}>{me.user.evony_name}</p>}
          </div>
        </div>
      </section>

      <section className="card">
        <h3>{d.profileTitle}</h3>
        <p className="muted">{d.profileBody}</p>
        <label className="field">
          <span>{d.emailLabel}</span>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
            style={{ width: "100%" }}
          />
        </label>
        <label className="field">
          <span>{d.nameLabel}</span>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            style={{ width: "100%" }}
          />
        </label>
        {profile.msg && (
          <p className={profile.error ? "warn" : "ok"} role={profile.error ? "alert" : "status"}>{profile.msg}</p>
        )}
        <button type="button" onClick={() => void saveProfile()} disabled={profile.busy}>
          {profile.busy ? d.profileSaving : d.profileSave}
        </button>
        <div style={{ marginTop: "0.8rem" }}>
          <UnlinkButton dict={dict} onUnlinked={() => void refresh()} />
        </div>
      </section>

      <section className="card">
        <div className="hsplit" style={{ marginBottom: "0.6rem" }}>
          <h3>{d.slotsTitle}</h3>
          <button onClick={() => void toggle()} disabled={edit.busy}>
            {enabled ? d.toggleOff : d.toggleOn}
          </button>
        </div>

        {!enabled && <p className="muted">{d.disabledNote}</p>}

        <SlotsEditor slots={slots} onChange={setSlots} dict={dict} />

        <p className="muted" style={{ margin: "0.9rem 0 0.6rem" }}>
          {d.gemCost}: {d.gems72}
        </p>

        <label className="ack">
          <input type="checkbox" checked={gemAck} onChange={(e) => setGemAck(e.target.checked)} />
          <span>{d.gemAck.replace("{gems}", ackGems.toLocaleString())}</span>
        </label>

        {edit.msg && (
          <p className={edit.error ? "warn" : "ok"} role={edit.error ? "alert" : "status"}>{edit.msg}</p>
        )}
        <button type="button" onClick={() => void save()} disabled={edit.busy || slots.length > MAX_SLOTS}>
          {edit.busy ? d.saving : d.save}
        </button>
      </section>

      <section className="card">
        <div className="hsplit">
          <div>
            <h3>{d.runTitle}</h3>
            {next ? (
              <p className="ok" style={{ margin: "0.3rem 0 0" }}>
                {d[DAY_KEYS[next.weekday - 1]]} {next.time}
                {" · "}{d.in} {countdown(nextTs - nowTs)}
              </p>
            ) : (
              <p className="muted" style={{ margin: "0.3rem 0 0" }}>{enabled ? d.never : d.disabledNote}</p>
            )}
          </div>
          <button onClick={() => void runNow()} disabled={run.busy}>
            {run.busy ? d.running : d.runNow}
          </button>
        </div>
        {run.msg === "queued" && <p className="ok" style={{ margin: "0.6rem 0 0" }}>{d.runQueued}</p>}
        {run.msg === "error" && <p className="warn" style={{ margin: "0.6rem 0 0" }}>{d.runError}</p>}

        <p className="muted" style={{ margin: "1rem 0 0" }}>
          {d.lastRun}:{" "}
          {me.last_run ? (
            <>
              <span className={statusClass(me.last_run.status)}>{me.last_run.status}</span>
              <span> · {String(me.last_run.created_at).replace("T", " ").slice(0, 16)}</span>
              {me.last_run.error && <span className="status-bad"> · {me.last_run.error}</span>}
            </>
          ) : (
            d.neverRun
          )}
        </p>
      </section>
    </section>
  );
}
