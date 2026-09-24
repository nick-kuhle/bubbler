"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/i18n";

type MasterData = {
  operator: string;
  slots: Array<{
    id: string; weekday: number; time: string; user_id: string;
    evony_name: string; active: number;
  }>;
  runs: Array<{ kind: string; status: string; shield_hours_remaining: number | null; created_at: string; evony_name: string }>;
  agent: {
    online: boolean; last_seen_at: string | null; last_event_at: string | null;
    version: string | null; hostname: string | null; offline_for_ms: number;
  };
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayName = (weekday: number): string => DAYS[weekday - 1] ?? String(weekday);

function ago(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function agentSince(ts: string | null): string {
  if (!ts) return "never";
  const ms = Date.now() - Date.parse(ts);
  return ms < 45_000 ? "just now" : `${ago(ms)} ago`;
}

function tone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("ok") || s.includes("success") || s.includes("done")) return "ok";
  if (s.includes("fail") || s.includes("error")) return "bad";
  if (s.includes("queue") || s.includes("pend") || s.includes("wait")) return "warn";
  return "";
}

export default function Master() {
  const [data, setData] = useState<MasterData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/master")
      .then(async (r) => {
        if (!r.ok) throw new Error(`operator read failed (${r.status}) — operator sign-in required`);
        return (await r.json()) as MasterData;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "unknown error"));
  }, []);

  if (error) {
    return (
      <section className="card warn">
        <p>{error}</p>
        <Link href="/">back to login</Link>
      </section>
    );
  }
  if (!data) {
    return <section className="card"><p className="muted">loading operator data…</p></section>;
  }

  return (
    <>
      <section className="hero-banner">
        <img src="/images/banner.jpg" alt="" className="cover" />
        <div className="veil" />
        <div className="copy hsplit">
          <div>
            <p className="kicker">Operator</p>
            <h1 className="title-gold font-display" style={{ margin: "0.15rem 0 0", fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}>
              War Room
            </h1>
            <p className="muted" style={{ maxWidth: 560 }}>
              operator <strong>{data.operator}</strong> — every claimed job for alliance LOL, newest first.
            </p>
          </div>
          <span className="badge">{data.operator}</span>
        </div>
      </section>

      <div style={{ display: "grid", gap: "1rem" }}>
        <section className="card">
          <div className="hsplit">
            <h3>phone agent</h3>
            <span className={`badge ${data.agent?.online ? "ok" : "warn"}`}>
              {data.agent?.online ? "online" : "offline"}
            </span>
          </div>
          <p className="muted" style={{ margin: "0.3rem 0 0" }}>
            last seen {data.agent ? agentSince(data.agent.last_seen_at) : "never"}
            {data.agent?.version ? ` · v${data.agent.version}` : ""}
            {data.agent?.hostname ? ` · ${data.agent.hostname}` : ""}
            {data.agent ? ` · last job ${agentSince(data.agent.last_event_at)}` : ""}
          </p>
          {data.agent && !data.agent.online && (
            <p className="warn" style={{ margin: "0.4rem 0 0" }}>
              silent for {ago(data.agent.offline_for_ms)} — no heartbeat, check the phone (docs/06).
            </p>
          )}
        </section>

        <section className="card">
          <h3>slots</h3>
          <table>
            <thead><tr><th>player</th><th>day</th><th>time</th><th>active</th></tr></thead>
            <tbody>
              {data.slots.map((s) => (
                <tr key={s.id}>
                  <td>{s.evony_name}</td>
                  <td>{dayName(s.weekday)}</td>
                  <td>{s.time}</td>
                  <td><span className={`badge ${s.active ? "ok" : ""}`}>{s.active ? "yes" : "no"}</span></td>
                </tr>
              ))}
              {data.slots.length === 0 && <tr><td colSpan={4} className="muted">no slots yet</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h3>runs</h3>
          <table>
            <thead><tr><th>player</th><th>kind</th><th>status</th><th>shield hrs left</th><th>created</th></tr></thead>
            <tbody>
              {data.runs.map((r, i) => (
                <tr key={i}>
                  <td>{r.evony_name}</td>
                  <td>{r.kind}</td>
                  <td><span className={`badge ${tone(r.status)}`}>{r.status}</span></td>
                  <td>{r.shield_hours_remaining ?? "—"}</td>
                  <td className="muted">{String(r.created_at).slice(0, 16)}</td>
                </tr>
              ))}
              {data.runs.length === 0 && <tr><td colSpan={5} className="muted">no runs yet — they appear as the scheduler works</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
