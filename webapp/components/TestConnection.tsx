"use client";

import { useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n";

type Props = { dict: Dict; email: string };

type TestState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "active"; id: string; server: "pending" | "running" }
  | { kind: "ok"; email: string }
  | { kind: "failed"; error: string }
  | { kind: "expired" }
  | { kind: "error" };

export default function TestConnection({ dict, email }: Props) {
  const d = dict.test;
  const [t, setT] = useState<TestState>({ kind: "idle" });

  async function start() {
    setT({ kind: "starting" });
    try {
      const r = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await r.json().catch(() => ({}))) as { test_id?: string };
      if (!r.ok || !data.test_id) {
        setT({ kind: "error" });
        return;
      }
      setT({ kind: "active", id: String(data.test_id), server: "pending" });
    } catch {
      setT({ kind: "error" });
    }
  }

  useEffect(() => {
    if (t.kind !== "active") return;
    const { id, server } = t;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/test-connection/${id}`, { cache: "no-store" });
        const data = (await r.json().catch(() => ({}))) as { state?: string; error?: string | null };
        const s = data.state;
        if (s === "ok") setT({ kind: "ok", email });
        else if (s === "failed") setT({ kind: "failed", error: data.error ?? "" });
        else if (s === "expired") setT({ kind: "expired" });
        else if ((s === "pending" || s === "running") && server !== s) {
          setT({ kind: "active", id, server: s });
        }
      } catch {
        // transient fetch failure — keep polling
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [t, email]);

  const busy = t.kind === "starting" || t.kind === "active";

  return (
    <section className="card">
      <div className="hsplit">
        <div>
          <h3>{d.title}</h3>
          <p className="muted" style={{ margin: "0.3rem 0 0" }}>{d.body}</p>
        </div>
        <button type="button" onClick={() => void start()} disabled={busy}>
          {busy ? d.running : d.run}
        </button>
      </div>

      {t.kind === "active" && (
        <p className="wizard-status">
          <span className="spin" aria-hidden />
          {t.server === "running" ? d.runningStatus.replace("{email}", email) : d.pending}
        </p>
      )}
      {t.kind === "ok" && <p className="ok" style={{ margin: "0.6rem 0 0" }}>{d.ok.replace("{email}", email)}</p>}
      {t.kind === "failed" && (
        <p className="warn" style={{ margin: "0.6rem 0 0" }}>
          {d.failed}
          {t.error ? ` — ${t.error}` : ""}
        </p>
      )}
      {t.kind === "expired" && <p className="warn" style={{ margin: "0.6rem 0 0" }}>{d.expired}</p>}
      {t.kind === "error" && <p className="warn" style={{ margin: "0.6rem 0 0" }}>{d.startError}</p>}
    </section>
  );
}