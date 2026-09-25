"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/src/i18n/navigation";
import { Link } from "@/src/i18n/navigation";
import UnlinkButton from "@/components/UnlinkButton";
import SlotsEditor, {
  DEFAULT_SLOTS,
  EditSlot,
  newSlot,
  slotsAreValid,
} from "@/components/SlotsEditor";

type LinkState = "idle" | "awaiting_phone" | "awaiting_code" | "linked" | "failed" | "expired";

const STEPS = 6;

export default function WizardForm() {
  const w = useTranslations("wizard");
  const d = useTranslations("dashboard");
  const tSlots = useTranslations("defaultSlots");
  const stepsShort = w.raw("stepsShort") as string[];
  const router = useRouter();
  const [already, setAlready] = useState<boolean | null>(null);
  const [account, setAccount] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);
  const [state, setState] = useState<LinkState>("idle");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  // Step 5: confirm the per-slot schedule (Mon 09:00 / Wed 09:00 / Fri 18:00 by default).
  const [slots, setSlots] = useState<EditSlot[]>(() => DEFAULT_SLOTS.map((s) => newSlot(s)));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { slots?: unknown } | null) => {
        if (cancelled) return;
        setAlready(Array.isArray(data?.slots) && data.slots.length > 0);
      })
      .catch(() => {
        if (!cancelled) setAlready(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!linkId) return;
    if (state === "linked" || state === "failed" || state === "expired") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/wizard/link/${linkId}`, { cache: "no-store" });
        const data = (await r.json()) as { state?: string; status?: string };
        const s = (data.state ?? data.status ?? "") as LinkState;
        if (!cancelled && (s === "awaiting_phone" || s === "awaiting_code" || s === "linked" || s === "failed" || s === "expired")) {
          setState(s);
        }
      } catch {
        // transient fetch failure — keep polling
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [linkId, state]);

  async function start(e: FormEvent) {
    e.preventDefault();
    const name = account.trim();
    if (!name) {
      setMessage({ kind: "error", text: w("startError") });
      return;
    }
    setMessage(null);
    try {
      const r = await fetch("/api/wizard/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evony_name: name }),
      });
      const data = (await r.json().catch(() => ({}))) as { link_id?: string; state?: string };
      if (!r.ok || !data.link_id) {
        setMessage({ kind: "error", text: w("startError") });
        return;
      }
      setLinkId(String(data.link_id));
      setState((data.state as LinkState) || "awaiting_phone");
      setCode("");
      setSubmitting(false);
    } catch {
      setMessage({ kind: "error", text: w("startError") });
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!linkId) return;
    if (!/^\d{6}$/.test(code)) {
      setMessage({ kind: "error", text: w("codeError") });
      return;
    }
    setMessage(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/wizard/link/${linkId}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) {
        setSubmitting(false);
        setMessage({ kind: "error", text: w("codeError") });
      }
    } catch {
      setSubmitting(false);
      setMessage({ kind: "error", text: w("codeError") });
    }
  }

  function restart() {
    setLinkId(null);
    setState("idle");
    setCode("");
    setSubmitting(false);
    setMessage(null);
    setAccount("");
    setScheduleSaved(false);
    setScheduleError(null);
    setSlots(DEFAULT_SLOTS.map((s) => newSlot(s)));
  }

  /** Step 5 → 6: persist the confirmed slots, then land on the dashboard. */
  async function confirmSchedule() {
    if (!slotsAreValid(slots)) {
      setScheduleError(slots.length === 0 ? d("emptySlots") : d("badTime"));
      return;
    }
    setScheduleError(null);
    setSavingSchedule(true);
    try {
      const r = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: slots.map((s) => ({
            weekday: s.weekday,
            time: s.time,
            shield_hours: s.shield_hours,
          })),
          shield_hours: 72,
          gem_ack: true,
        }),
      });
      if (!r.ok) {
        setSavingSchedule(false);
        setScheduleError(w("step5Error"));
        return;
      }
      setScheduleSaved(true);
      setSavingSchedule(false);
      router.push("/dashboard");
    } catch {
      setSavingSchedule(false);
      setScheduleError(w("step5Error"));
    }
  }

  const step =
    linkId === null
      ? 1
      : state === "awaiting_phone" || state === "awaiting_code"
        ? submitting
          ? 4
          : 3
          : state === "linked"
            ? scheduleSaved
              ? 6
              : 5
            : 1;

  if (already === null) {
    return (
      <section className="card" style={{ maxWidth: 560, margin: "3rem auto" }}>
        <p className="muted">{w("loading")}</p>
      </section>
    );
  }

  if (already) {
    return (
      <section className="card" style={{ maxWidth: 560, margin: "3rem auto", textAlign: "center" }}>
        <span className="check" aria-hidden>✓</span>
        <h2 style={{ margin: "0.6rem 0 0.3rem" }}>{w("alreadyTitle")}</h2>
        <p className="muted">{w("alreadyBody")}</p>
        <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
          <Link className="btn" href="/dashboard">{w("goDashboard")}</Link>
          <UnlinkButton onUnlinked={() => setAlready(false)} />
        </div>
      </section>
    );
  }

  if (state === "failed" || state === "expired") {
    return (
      <section className="card" style={{ maxWidth: 560, margin: "3rem auto", textAlign: "center" }}>
        <span className="tile sun" aria-hidden>😅</span>
        <h2 style={{ margin: "0.6rem 0 0.3rem" }}>
          {state === "expired" ? w("expiredTitle") : w("failedTitle")}
        </h2>
        <p className="muted">{state === "expired" ? w("expiredBody") : w("failedBody")}</p>
        <button onClick={restart} style={{ marginTop: "1rem" }}>{w("retry")}</button>
      </section>
    );
  }

  return (
    <section className="card" style={{ maxWidth: 600, margin: "0 auto" }}>
      <div className="section-head">
        <span className="tile" aria-hidden>🔗</span>
        <div>
          <h2 style={{ marginBottom: "0.2rem" }}>{w("title")}</h2>
          <p className="muted" style={{ margin: 0 }}>{w("intro")}</p>
        </div>
      </div>

      <div className="steps" role="list" aria-label={`${w("step")} ${step} ${w("of")} ${STEPS}`}>
        {stepsShort.map((label, i) => {
          const n = i + 1;
          const cls = n < step ? "done" : n === step ? "active" : "";
          return (
            <span key={label} role="listitem" className={`step ${cls}`.trim()}>
              <span className="n" aria-hidden>{n < step ? "✓" : n}</span>
              {label}
            </span>
          );
        })}
      </div>

      {step === 1 && (
        <form onSubmit={(e) => void start(e)}>
          <h3>{w("step1Title")}</h3>
          <p className="muted">{w("step1Body")}</p>
          <label className="field">
            <span>{w("accountLabel")}</span>
            <input
              type="text"
              autoFocus
              value={account}
              placeholder={w("accountPlaceholder")}
              onChange={(e) => setAccount(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          {message && <p className="warn" role="alert">{message.text}</p>}
          <button type="submit">{w("start")}</button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={(e) => void submitCode(e)}>
          <h3>{w("step3Title")}</h3>
          {state === "awaiting_phone" ? (
            <p className="wizard-status">
              <span className="spin" aria-hidden />
              {w("step2Waiting")}
            </p>
          ) : (
            <p className="wizard-status ok">
              <span>✓</span>
              {w("step2Connected")}
            </p>
          )}
          <p className="muted">{w("step3Body")}</p>
          <label className="field">
            <span>{w("step3Title")}</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              value={code}
              placeholder={w("codePlaceholder")}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="otp"
              style={{ width: "100%" }}
            />
          </label>
          {message && <p className="warn" role="alert">{message.text}</p>}
          <button type="submit" disabled={code.length !== 6}>{w("submitCode")}</button>
        </form>
      )}

      {step === 4 && (
        <div>
          <h3>{w("step4Title")}</h3>
          <p className="wizard-status">
            <span className="spin" aria-hidden />
            {w("step4Body")}
          </p>
        </div>
      )}

      {step === 5 && (
        <div>
          <h3>{w("step5Title")}</h3>
          <p className="muted">{w("step5Body")}</p>
          <p className="muted" style={{ margin: "0.2rem 0 0.8rem" }}>
            {tSlots("mon")} · {tSlots("wed")} · {tSlots("fri")}
          </p>
          <SlotsEditor slots={slots} onChange={setSlots} />
          {scheduleError && (
            <p className="warn" role="alert" style={{ marginTop: "0.6rem" }}>{scheduleError}</p>
          )}
          <button
            type="button"
            onClick={() => void confirmSchedule()}
            disabled={savingSchedule}
            style={{ marginTop: "0.9rem" }}
          >
            {savingSchedule ? w("step5Saving") : w("step5Confirm")}
          </button>
        </div>
      )}

      {step === 6 && (
        <div style={{ textAlign: "center" }}>
          <span className="check" aria-hidden>✓</span>
          <h3 style={{ margin: "0.6rem 0 0.3rem" }}>{w("step6Title")}</h3>
          <p className="muted">{w("step6Body")}</p>
          <Link className="btn" href="/dashboard" style={{ marginTop: "0.5rem", display: "inline-block" }}>
            {w("toDashboard")}
          </Link>
        </div>
      )}
    </section>
  );
}
