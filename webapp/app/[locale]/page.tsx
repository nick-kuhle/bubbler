"use client";

import { FormEvent, useState } from "react";

import { Link, useLocale, useTranslations } from "@/lib/i18n";

export default function Landing() {
  const locale = useLocale();
  const tl = useTranslations("landing");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error(`login failed (${r.status})`);
      const data = (await r.json()) as { evony_name: string; is_operator: boolean };
      window.location.href = data.is_operator ? `/${locale}/master` : `/${locale}/dashboard`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
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

      <section className="card" style={{ maxWidth: 420, margin: "1.6rem auto 0", textAlign: "left" }}>
        <form onSubmit={submit}>
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
            {busy ? tl("busy") : tl("signin")}
          </button>
        </form>
        <p style={{ textAlign: "center", margin: "1rem 0 0" }}>
          <Link href="/info" className="how-link">
            {tl("how")} →
          </Link>
        </p>
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
