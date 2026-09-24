"use client";

import { useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n";

type Props = { dict: Dict };

type TestState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "active"; id: string; server: "pending" | "running"; agentOnline: boolean }
  | { kind: "ok"; confirmed: string | null; verified: boolean }
  | { kind: "failed"; error: string }
  | { kind: "expired" }
  | { kind: "error" };

type PollData = {
  ok: boolean;
  state?: string;
  error?: string | null;
  confirmed_name?: string | null;
  verified?: boolean | null;
  agent_online?: boolean;
};

export default function TestConnection({ dict }: Props) {
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
      setT({ kind: "active", id: String(data.test_id), server: "pending", agentOnline: true });
    } catch {
      setT({ kind: "error" });
    }
  }

  useEffect(() => {
    if (t.kind !== "active") return;
    const { id, server, agentOnline } = t;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/test-connection/${id}`, { cache: "no-store" });
        const data = (await r.json().catch(() => ({}))) as PollData;
        const s = data.state;
        if (s === "ok") setT({ kind: "ok", confirmed: data.confirmed_name ?? null, verified: data.verified === true });
        else if (s === "failed") setT({ kind: "failed", error: data.error ?? "" });
        else if (s === "expired") setT({ kind: "expired" });
        else if (s === "pending" || s === "running") {
          const agentOnlineNow = data.agent_online !== false;
          if (server !== s || agentOnlineNow !== agentOnline) {
            setT({ kind: "active", id, server: s, agentOnline: agentOnlineNow });
          }
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
  }, [t]);

  const busy = t.kind === "starting" || t.kind === "active";

  return (
    <section className="card">
      <div className="section-head">
        <span className="tile sm" aria-hidden>🔌</span>
        <div>
          <h3>{d.title}</h3>
          <p className="muted">{d.body}</p>
        </div>
      </div>
      <button type="button" onClick={() => void start()} disabled={busy} style={{ width: "100%" }}>
        {busy ? d.running : d.run}
      </button>

      {t.kind === "active" && !t.agentOnline && (
        <p className="warn" style={{ margin: "0.6rem 0 0" }}>{d.agentOffline}</p>
      )}
      {t.kind === "active" && (
        <p className="wizard-status">
          <span className="spin" aria-hidden />
          {t.server === "running" ? d.runningStatus : d.pending}
        </p>
      )}
      {t.kind === "ok" && (
        <p className="ok" style={{ margin: "0.6rem 0 0" }}>
          {t.verified && t.confirmed
            ? d.okName.replace("{name}", t.confirmed)
            : d.okUnverified}
        </p>
      )}
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