"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type AgentData = {
  ok: boolean;
  online: boolean;
  last_seen_at: string | null;
  last_event_at: string | null;
  version: string | null;
  offline_for_ms: number;
};

function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Small liveness chip fed by /api/agent/status (the phone's own heartbeat). */
export default function AgentStatus() {
  const d = useTranslations("agentStatus");
  const [agent, setAgent] = useState<AgentData | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const r = await fetch("/api/agent/status", { cache: "no-store" });
        if (r.ok) setAgent((await r.json()) as AgentData);
      } catch {
        // transient — keep polling
      }
      if (!cancelled) timer = setTimeout(poll, 20000);
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!agent) return null;
  const when = (ts: string | null) => (ts ? (Date.now() - Date.parse(ts) < 45_000 ? d("now") : `${ago(Date.now() - Date.parse(ts))}`) : "");
  const lastSeen = agent.last_seen_at ? d("lastSeen", { ago: when(agent.last_seen_at) }) : d("never");
  const claimed = agent.last_event_at ? d("lastClaimed", { ago: when(agent.last_event_at) }) : null;

  return (
    <p className={`agent-chip ${agent.online ? "ok" : "warn"}`} style={{ margin: "0.6rem 0 0" }}>
      <span className="dot" aria-hidden />
      <strong>{d("title")}:</strong> {agent.online ? d("online") : d("offline")} · {lastSeen}
      {agent.version ? ` · ${d("version", { v: agent.version })}` : ""}
      {claimed ? ` · ${claimed}` : ""}
    </p>
  );
}
