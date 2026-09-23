// app/[locale]/page.tsx — landing / magic-link login. Email IS the login (and the Evony login).
// No passwords stored. First use of a private email is seed-gated (we decide who's in).

"use client";

import { FormEvent, useState } from "react";

import { useLocale } from "@/lib/i18n";

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
    <section className="card" style={{ maxWidth: 420, margin: "4rem auto" }}>
      <h1>LOL automatic bubble scheduler</h1>
      <p className="tagline">
        Alliance LOL — we don&apos;t take things seriously, we just keep the bubbles up.
      </p>
      <p className="muted">
        Overlapping 3-day truces on schedule (2,500 gems each). Your email signs you in —
        the same one you use in the game, so there are no extra passwords to manage.
      </p>
      <form onSubmit={submit}>
        <label>
          email
          <br />
          <input
            type="email"
            required
            autoFocus
            value={email}
            placeholder="your@email.com"
            style={{ width: "100%", marginTop: "0.4rem" }}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && <p className="warn" role="alert">{error}</p>}
        <button type="submit" disabled={busy} style={{ marginTop: "0.9rem" }}>
          {busy ? "signing in…" : "sign in"}
        </button>
      </form>
    </section>
  );
}