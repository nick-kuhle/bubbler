// app/[locale]/master/page.tsx — operator read-only view. Calls the one route that exists for it:
// GET /api/master → { operator, slots, runs }. Per-slot model: one row per (day, time).

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
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayName = (weekday: number): string => DAYS[weekday - 1] ?? String(weekday);

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

  if (error) return <section className="card warn"><p>{error}</p><Link href="/">back to login</Link></section>;
  if (!data) return <section className="card"><p className="muted">loading operator data…</p></section>;

  return (
    <section className="card">
      <h2>LOL · master runs</h2>
      <p className="muted">
        operator <strong>{data.operator}</strong> — every claimed job for alliance LOL, newest first.
      </p>

      <h3 style={{ marginTop: "1.2rem" }}>slots</h3>
      <table>
        <thead><tr><th>player</th><th>day</th><th>time</th><th>active</th></tr></thead>
        <tbody>
          {data.slots.map((s) => (
            <tr key={s.id}>
              <td>{s.evony_name}</td>
              <td>{dayName(s.weekday)}</td>
              <td>{s.time}</td>
              <td>{s.active ? "yes" : "no"}</td>
            </tr>
          ))}
          {data.slots.length === 0 && <tr><td colSpan={4} className="muted">no slots yet</td></tr>}
        </tbody>
      </table>

      <h3 style={{ marginTop: "1.6rem" }}>runs</h3>
      <table>
        <thead><tr><th>player</th><th>kind</th><th>status</th><th>shield hrs left</th><th>created</th></tr></thead>
        <tbody>
          {data.runs.map((r, i) => (
            <tr key={i}>
              <td>{r.evony_name}</td>
              <td>{r.kind}</td>
              <td>{r.status}</td>
              <td>{r.shield_hours_remaining ?? "—"}</td>
              <td className="muted">{String(r.created_at).slice(0, 16)}</td>
            </tr>
          ))}
          {data.runs.length === 0 && <tr><td colSpan={5} className="muted">no runs yet — they appear as the scheduler works</td></tr>}
        </tbody>
      </table>
    </section>
  );
}