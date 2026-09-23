"use client";

import { FormEvent, useState } from "react";

import { Link, useLocale } from "@/lib/i18n";

export default function Landing() {
  const locale = useLocale();
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

  return (
    <div className="login-wrap">
      <img src="/images/logo.png" alt="LOL Bubbler crest" className="login-crest" />
      <p className="kicker" style={{ marginTop: "1.1rem" }}>Alliance LOL</p>
      <h1 className="title-gold font-display" style={{ fontSize: "clamp(2rem, 6vw, 3.4rem)", margin: "0.4rem 0 0" }}>
        LOL bubbler
      </h1>
      <p className="tagline" style={{ maxWidth: 520, margin: "0.8rem auto 0" }}>
        Alliance LOL — we don&apos;t take things seriously, we just keep the bubbles up.
      </p>
      <p className="muted" style={{ maxWidth: 480, margin: "0.45rem auto 0" }}>
        Overlapping 3-day truces on schedule (2,500 gems each). Your email signs you in —
        the same one you use in the game.
      </p>

      <section className="card" style={{ maxWidth: 420, margin: "1.6rem auto 0", textAlign: "left" }}>
        <form onSubmit={submit}>
          <label className="field">
            <span>email</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              placeholder="your@email.com"
              style={{ width: "100%" }}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <p className="warn" role="alert">{error}</p>}
          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "signing in…" : "enter the keep"}
          </button>
        </form>
        <p style={{ textAlign: "center", margin: "1rem 0 0" }}>
          <Link href="/info" style={{ color: "var(--gold)", fontWeight: 800, fontSize: "0.78rem", letterSpacing: "0.14em", textTransform: "uppercase", textDecoration: "none" }}>
            how it works →
          </Link>
        </p>
      </section>

      <div className="login-grid">
        <figure>
          <img src="/images/gem.png" alt="" />
          <figcaption>2,500 💎</figcaption>
        </figure>
        <figure>
          <img src="/images/truce.jpg" alt="" />
          <figcaption>72h truce</figcaption>
        </figure>
        <figure>
          <img src="/images/keep.jpg" alt="" />
          <figcaption>No lapse</figcaption>
        </figure>
      </div>
    </div>
  );
}
