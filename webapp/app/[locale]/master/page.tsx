"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/lib/i18n";

type Agent = {
  online: boolean; last_seen_at: string | null; last_event_at: string | null;
  version: string | null; hostname: string | null; pid: number | null; offline_for_ms: number;
};
type Account = {
  id: string; email: string; evony_name: string; is_operator: number;
  slot_count: number; active_slots: number; last_link_state: string | null; last_run_status: string | null;
  created_at: string;
};
type Slot = { id: string; user_id: string; evony_name: string; weekday: number; time: string; active: number };
type Session = { id: string; user_id: string; email: string; expires_at: string; created_at: string };
type LinkSession = { id: string; user_id: string; email: string; state: string; error: string | null; created_at: string };
type TestSession = { id: string; user_id: string; email: string; state: string; error: string | null; verified: number | null; created_at: string };
type Job = { id: string; kind: string; status: string; user_id: string; email: string; created_at: string; claimed_at: string | null };
type Run = { id: string; trigger: string; status: string; shield_hours_remaining: number | null; evidence_ref: string | null; error: string | null; duration_ms: number | null; created_at: string; evony_name: string };

type Overview = {
  operator: { email: string; evony_name: string };
  counts: { users: number; sessions: number; link_sessions: number; test_sessions: number; jobs: number; jobs_pending: number; runs: number };
  accounts: Account[];
  slots: Slot[];
  sessions: Session[];
  link_sessions: LinkSession[];
  test_sessions: TestSession[];
  jobs: Job[];
  runs: Run[];
  agent: Agent;
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
const fmt = (ts: string | null | undefined): string =>
  ts ? String(ts).slice(0, 16).replace("T", " ") : "—";
const since = (ts: string | null): string =>
  !ts ? "never" : ago(Date.now() - Date.parse(ts)) + " ago";
const agentSince = (ts: string | null): string =>
  !ts ? "never" : Date.now() - Date.parse(ts) < 45_000 ? "just now" : since(ts);

function tone(status: string | null): string {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("ok") || s.includes("success") || s.includes("linked") || s.includes("done") || s.includes("applied")) return "ok";
  if (s.includes("fail") || s.includes("error") || s.includes("expired")) return "bad";
  if (s.includes("pend") || s.includes("wait") || s.includes("await") || s.includes("claim")) return "warn";
  return "";
}

type Notice = { kind: "ok" | "err"; text: string } | null;

export default function Master() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/overview");
      if (!r.ok) throw new Error(`operator read failed (${r.status}) — operator sign-in required`);
      setData((await r.json()) as Overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    }
  }, []);

  useEffect(() => {
    void load();
    pollRef.current = setInterval(() => void load(), 20_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  async function act(key: string, fn: () => Promise<Response>, okText: string) {
    setBusyAction(key);
    setNotice(null);
    try {
      const r = await fn();
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setNotice({ kind: "err", text: `${okText} failed — ${body.error ?? r.status}` });
      } else {
        setNotice({ kind: "ok", text: okText });
        await load();
      }
    } catch (e) {
      setNotice({ kind: "err", text: `${okText} failed — ${e instanceof Error ? e.message : "unknown"}` });
    } finally {
      setBusyAction(null);
    }
  }

  const bubble = (a: Account) =>
    act(`bubble:${a.id}`, () => fetch("/api/runs/now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: a.id }),
    }), `bubble queued for ${a.evony_name}`);
  const relink = (a: Account) =>
    act(`relink:${a.id}`, () => fetch(`/api/admin/users/${encodeURIComponent(a.id)}/relink`, { method: "POST" }), `relink queued for ${a.evony_name}`);
  const cutSessions = (a: Account) => {
    if (!window.confirm(`Cut every session for ${a.evony_name}? Their phone link will stop until they log in again.`)) return;
    void act(`cut:${a.id}`, () => fetch(`/api/admin/sessions?user_id=${encodeURIComponent(a.id)}`, { method: "DELETE" }), `sessions cut for ${a.evony_name}`);
  };
  const cutSession = (s: Session) => {
    if (!window.confirm("Cut this session?")) return;
    void act(`cutsexp:${s.id}`, () => fetch(`/api/admin/sessions?session_id=${encodeURIComponent(s.id)}`, { method: "DELETE" }), "session cut");
  };
  const toggleSlot = (s: Slot) =>
    act(`slot:${s.id}`, () => fetch(`/api/admin/slots/${encodeURIComponent(s.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: s.active === 0 }),
    }), `slot ${dayName(s.weekday)} ${s.time}`);

  if (error) {
    return (
      <section className="card warn">
        <p>{error}</p>
        <Link href="/">back to login</Link>
      </section>
    );
  }
  if (!data) {
    return <section className="card"><p className="muted">loading admin data…</p></section>;
  }

  return (
    <>
      <section className="hero-banner">
        <img src="/images/sky-hero.jpg" alt="" className="cover" />
        <div className="veil" />
        <div className="copy hsplit">
          <div>
            <p className="kicker">Admin · {data.operator.email}</p>
            <h1 className="title-pop font-display" style={{ margin: "0.15rem 0 0", fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}>
              War Room
            </h1>
            <p className="muted" style={{ maxWidth: 620 }}>
              Every account, schedule, session and run for alliance LOL. More bubbles, fewer worries.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
            <button type="button" onClick={() => void load()}>refresh</button>
            {busyAction && <span className="badge warn">working…</span>}
          </div>
        </div>
      </section>

      {notice && (
        <section className={`card ${notice.kind === "err" ? "warn" : ""}`}>
          <p className={notice.kind === "err" ? "warn" : "ok"} role="status">{notice.text}</p>
        </section>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        <section className="card">
          <div className="hsplit">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <span className="tile sm" aria-hidden>📡</span>
              <div>
                <h3>phone agent</h3>
                <p className="muted" style={{ margin: 0 }}>long-polls every ~1s; claims jobs by handoff</p>
              </div>
            </div>
            <span className={`badge ${data.agent?.online ? "ok" : "warn"}`}>
              {data.agent?.online ? "online" : "offline"}
            </span>
          </div>
          <p className="muted" style={{ margin: "0.6rem 0 0" }}>
            last seen {data.agent ? agentSince(data.agent.last_seen_at) : "never"}
            {data.agent?.version ? ` · v${data.agent.version}` : ""}
            {data.agent?.hostname ? ` · ${data.agent.hostname}` : ""}
            {data.agent?.pid ? ` · pid ${data.agent.pid}` : ""}
            {data.agent ? ` · last job ${agentSince(data.agent.last_event_at)}` : ""}
          </p>
          {data.agent && !data.agent.online && (
            <p className="warn" style={{ margin: "0.4rem 0 0" }}>
              quiet for {ago(data.agent.offline_for_ms)} with no heartbeat — wake the phone and check the agent.
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.8rem" }}>
            <span className="badge">users {data.counts.users}</span>
            <span className="badge">sessions {data.counts.sessions}</span>
            <span className={`badge ${data.counts.jobs_pending ? "warn" : "ok"}`}>jobs {data.counts.jobs} · {data.counts.jobs_pending} active</span>
            <span className="badge">runs {data.counts.runs}</span>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <span className="tile sm" aria-hidden>🪪</span>
            <div><h3>accounts ({data.counts.users})</h3></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>player</th><th>email</th><th>slots</th><th>last link</th><th>last run</th><th>controls</th></tr></thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.evony_name}
                      {a.is_operator ? <span className="badge" style={{ marginLeft: 6 }}>admin</span> : null}
                    </td>
                    <td>{a.email}</td>
                    <td><span className={`badge ${a.active_slots ? "ok" : ""}`}>{a.active_slots}/{a.slot_count}</span></td>
                    <td>{a.last_link_state ? <span className={`badge ${tone(a.last_link_state)}`}>{a.last_link_state}</span> : <span className="muted">never</span>}</td>
                    <td>{a.last_run_status ? <span className={`badge ${tone(a.last_run_status)}`}>{a.last_run_status}</span> : <span className="muted">none</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" disabled={busyAction === `bubble:${a.id}`} onClick={() => void bubble(a)}>
                          {busyAction === `bubble:${a.id}` ? "…" : "🛡 bubble"}
                        </button>
                        <button type="button" disabled={busyAction === `relink:${a.id}`} onClick={() => void relink(a)}>
                          {busyAction === `relink:${a.id}` ? "…" : "🔗 relink"}
                        </button>
                        <button type="button" className="subtle" disabled={busyAction === `cut:${a.id}`} onClick={() => cutSessions(a)}>
                          cut sessions
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="hsplit">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <span className="tile sm" aria-hidden>📅</span>
              <div><h3>slots ({data.slots.length})</h3></div>
            </div>
            <button type="button" className="subtle" onClick={() => void load()}>reload</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>player</th><th>day</th><th>time (UTC)</th><th>active</th></tr></thead>
              <tbody>
                {data.slots.map((s) => (
                  <tr key={s.id}>
                    <td>{s.evony_name}</td>
                    <td>{dayName(s.weekday)}</td>
                    <td>{s.time}</td>
                    <td>
                      <button
                        type="button"
                        className="subtle"
                        disabled={busyAction === `slot:${s.id}`}
                        onClick={() => void toggleSlot(s)}
                      >
                        {s.active ? "on ✓" : "off ✕"}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.slots.length === 0 && <tr><td colSpan={4} className="muted">no slots yet</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <span className="tile sm" aria-hidden>🔑</span>
            <div><h3>sessions ({data.counts.sessions})</h3></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>user</th><th>created</th><th>expires</th><th></th></tr></thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.email}</td>
                    <td className="muted">{fmt(s.created_at)}</td>
                    <td className="muted">{fmt(s.expires_at)}</td>
                    <td>
                      <button type="button" className="subtle" disabled={busyAction === `cutsexp:${s.id}`} onClick={() => cutSession(s)}>cut</button>
                    </td>
                  </tr>
                ))}
                {data.sessions.length === 0 && <tr><td colSpan={4} className="muted">none</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <span className="tile sm" aria-hidden>🔄</span>
            <div><h3>link sessions ({data.counts.link_sessions})</h3></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>user</th><th>state</th><th>error</th><th>created</th></tr></thead>
              <tbody>
                {data.link_sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.email}</td>
                    <td><span className={`badge ${tone(s.state)}`}>{s.state}</span></td>
                    <td className="muted">{s.error ?? ""}</td>
                    <td className="muted">{fmt(s.created_at)}</td>
                  </tr>
                ))}
                {data.link_sessions.length === 0 && <tr><td colSpan={4} className="muted">none</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <span className="tile sm" aria-hidden>📋</span>
            <div><h3>jobs ({data.counts.jobs})</h3></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>kind</th><th>user</th><th>status</th><th>created</th><th>claimed</th></tr></thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.kind}</td>
                    <td>{j.email}</td>
                    <td><span className={`badge ${tone(j.status)}`}>{j.status}</span></td>
                    <td className="muted">{fmt(j.created_at)}</td>
                    <td className="muted">{j.claimed_at ? fmt(j.claimed_at) : ""}</td>
                  </tr>
                ))}
                {data.jobs.length === 0 && <tr><td colSpan={5} className="muted">none</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="hsplit">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <span className="tile sm" aria-hidden>🚀</span>
              <div><h3>runs ({data.counts.runs})</h3></div>
            </div>
            <span className="badge">newest first</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>player</th><th>trigger</th><th>status</th><th>shield hrs left</th><th>evidence</th><th>created</th></tr></thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.evony_name}</td>
                    <td>{r.trigger}</td>
                    <td><span className={`badge ${tone(r.status)}`}>{r.status}</span></td>
                    <td>{r.shield_hours_remaining ?? "—"}</td>
                    <td>{r.evidence_ref ? <a href={r.evidence_ref} target="_blank" rel="noreferrer">view</a> : <span className="muted">—</span>}</td>
                    <td className="muted">{fmt(r.created_at)}</td>
                  </tr>
                ))}
                {data.runs.length === 0 && (
                  <tr><td colSpan={6} className="muted">no runs yet — they appear as the scheduler fires</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}