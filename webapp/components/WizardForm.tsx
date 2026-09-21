"use client";

import { FormEvent, useState } from "react";

type Props = {
  title: string;
  intro: string;
  emailLabel: string;
  send: string;
  sent: string;
  error: string;
};

export default function WizardForm({ title, intro, emailLabel, send, sent, error }: Props) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    setFailed(false);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) setDone(true);
    else setFailed(true);
  }

  return (
    <section className="card" style={{ maxWidth: 420, margin: "4rem auto" }}>
      <h2>{title}</h2>
      <p className="muted">{intro}</p>
      <form onSubmit={submit}>
        <label>
          {emailLabel}
          <br />
          <input
            type="email"
            required
            value={email}
            style={{ width: "100%", marginTop: "0.4rem" }}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {done && <p role="status">{sent}</p>}
        {failed && <p className="warn" role="alert">{error}</p>}
        <button type="submit" style={{ marginTop: "0.9rem" }}>{send}</button>
      </form>
    </section>
  );
}
