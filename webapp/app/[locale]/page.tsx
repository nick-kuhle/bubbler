"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { useLocale, useTranslations } from "next-intl";

type Mode = "register" | "login";

type Step = "email" | "verify";

type CodeResponse = {
  ok?: boolean;
  sent?: boolean;
  dev_code?: string;
  error?: string;
};

type LoginResponse = {
  ok?: boolean;
  created?: boolean;
  is_operator?: boolean;
  error?: string;
};

export default function Landing() {
  const locale = useLocale();
  const tl = useTranslations("landing");
  const ti = useTranslations("info");
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const resendAt = useRef(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((resendAt.current - Date.now()) / 1000));
      setResendIn(left);
    }, 1000);
    return () => clearInterval(id);
  }, [resendIn <= 0]);

  function startCooldown(seconds: number) {
    resendAt.current = Date.now() + seconds * 1000;
    setResendIn(seconds);
  }

  function pickMode(m: Mode) {
    setMode(m);
    setStep("email");
    setCode("");
    setError(null);
    setOkMsg(null);
  }

  function reset() {
    setMode(null);
    setStep("email");
    setCode("");
    setError(null);
    setOkMsg(null);
  }

  function sendErrors(code: string, fallback: string): string {
    switch (code) {
      case "not-invited": return tl("errNotInvited");
      case "cooldown": return tl("errCooldown");
      case "rate-limit": return tl("errRateLimit");
      case "email-not-configured": return tl("errEmailNotConfigured");
      case "send-failed": return tl("errSendFailed");
      default: return fallback;
    }
  }

  function loginErrors(code: string, fallback: string): string {
    switch (code) {
      case "bad-code": return tl("errBadCode");
      case "no-code": return tl("errNoCode");
      case "too-many": return tl("errTooMany");
      case "not-invited": return tl("errNotInvited");
      default: return fallback;
    }
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const r = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await r.json().catch(() => ({}))) as CodeResponse;
      if (!r.ok || !data.ok) {
        setError(sendErrors(data.error ?? "", `code failed (${r.status})`));
        return;
      }
      if (data.dev_code) setCode(data.dev_code);
      setStep("verify");
      setOkMsg(tl("codeSentFor", { email }));
      startCooldown(30);
    } catch {
      setError(tl("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function resend(e: FormEvent) {
    e.preventDefault();
    if (resendIn > 0) return;
    await sendCode();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await r.json().catch(() => ({}))) as LoginResponse;
      if (!r.ok || !data.ok) {
        setError(loginErrors(data.error ?? "", `login failed (${r.status})`));
        return;
      }
      const dest = data.created
        ? `/${locale}/wizard?welcome=1`
        : data.is_operator
          ? `/${locale}/master`
          : `/${locale}/dashboard`;
      window.location.assign(dest);
    } catch {
      setError(tl("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const feats = [
    { icon: "🛡️", cls: "", t: tl("f1t"), b: tl("f1b") },
    { icon: "💎", cls: "sun", t: tl("f2t"), b: tl("f2b") },
    { icon: "🎉", cls: "green", t: tl("f3t"), b: tl("f3b") },
  ];

  return (
    <div className="login-wrap">
      <img src="/images/logo.png" alt="LOL Bubbler crest" className="login-crest" />
      <p className="kicker" style={{ marginTop: "1.1rem" }}>{tl("kicker")}</p>
      <h1 className="title-pop font-display" style={{ fontSize: "clamp(2.2rem, 6vw, 3.6rem)", margin: "0.3rem 0 0", lineHeight: 1.05 }}>
        {tl("title")}
      </h1>
      <p className="tagline" style={{ maxWidth: 540, margin: "0.7rem auto 0" }}>
        {tl("sub")}
      </p>

      <section className="card" style={{ maxWidth: 480, margin: "1.6rem auto 0", textAlign: "left" }}>
        {!mode && (
          <>
            <h2 style={{ margin: "0 0 0.2rem" }}>{tl("chooseTitle")}</h2>
            <p className="muted" style={{ margin: "0 0 1rem" }}>{tl("chooseBody")}</p>
            <div style={{ display: "grid", gap: "0.8rem" }}>
              <button type="button" onClick={() => pickMode("register")} style={{ width: "100%" }}>
                {tl("register")}
              </button>
              <button type="button" className="btn-soft" onClick={() => pickMode("login")} style={{ width: "100%" }}>
                {tl("login")}
              </button>
            </div>
            <p className="muted" style={{ margin: "1rem 0 0 0", fontSize: "0.85rem" }}>
              {ti("privateBody")}
            </p>
          </>
        )}

        {mode && step === "email" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
          >
            <h2 style={{ margin: "0 0 0.2rem" }}>
              {mode === "register" ? tl("register") : tl("login")}
            </h2>
            <p className="muted" style={{ margin: "0 0 0.9rem" }}>
              {mode === "register" ? tl("registerBody") : tl("loginBody")}
            </p>
            <label className="field">
              <span>{tl("email")}</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                placeholder={tl("emailPh")}
                style={{ width: "100%" }}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <p className="warn" role="alert">{error}</p>}
            <button type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? tl("sending") : mode === "register" ? tl("sendRegister") : tl("sendLogin")}
            </button>
            <p style={{ textAlign: "center", margin: "0.8rem 0 0" }}>
              <button type="button" className="how-link" onClick={reset} style={{ boxShadow: "none" }}>
                ← {tl("changeMode")}
              </button>
            </p>
          </form>
        )}

        {mode && step === "verify" && (
          <form onSubmit={(e) => void verify(e)}>
            <h2 style={{ margin: "0 0 0.2rem" }}>{tl("sentTitle")}</h2>
            <p className="muted" style={{ margin: "0 0 0.4rem" }}>
              {tl("sentBody").split("{email}")[0]}
              <strong>{email}</strong>
              {tl("sentBody").split("{email}")[1]}
            </p>
            {okMsg && <p className="ok" role="status">{okMsg}</p>}
            <label className="field" style={{ marginTop: "0.7rem" }}>
              <span>{tl("codeLabel")}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={6}
                pattern="[0-9]*"
                value={code}
                placeholder={tl("codePh")}
                style={{ width: "100%", letterSpacing: "0.4em", fontFamily: "monospace", fontSize: "1.3rem" }}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            {error && <p className="warn" role="alert">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} style={{ width: "100%" }}>
              {busy ? tl("verifying") : mode === "register" ? tl("createAccount") : tl("verify")}
            </button>
            <div className="row" style={{ justifyContent: "center", marginTop: "0.8rem" }}>
              <button type="button" className="how-link" disabled={busy || resendIn > 0} style={{ boxShadow: "none" }} onClick={(e) => void resend(e)}>
                {resendIn > 0 ? tl("resendIn", { s: resendIn }) : tl("resend")}
              </button>
              <button type="button" className="how-link" disabled={busy} style={{ boxShadow: "none" }} onClick={() => { setStep("email"); setCode(""); setError(null); }}>
                {tl("diffEmail")}
              </button>
            </div>
          </form>
        )}
      </section>

      <div className="feat-grid">
        {feats.map((f) => (
          <div key={f.t} className="feat">
            <span className={`tile ${f.cls}`.trim()} aria-hidden>{f.icon}</span>
            <h3>{f.t}</h3>
            <p>{f.b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
