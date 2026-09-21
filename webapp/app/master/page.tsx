// app/master/page.tsx — operator read-only view. Calls the one route that exists for it:
// GET /api/master → { operator, schedules, runs }. Renders exactly those fields.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MasterData = {
  operator: string;
  schedules: Array<{
    id: string; weekdays: number; time: string; gem_ack: number;
    active: number; email: string; evony_name: string;
  }>;
  runs: Array<{ kind: string; status: string; shield_hours_remaining: number | null; created_at: string; evony_name: string }>;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayNames = (mask: number): string =>
  DAYS.filter((_, i) => (mask & (1 << i)) !== 0).join(", ") || "none";

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
      <h2>bubbler · master runs</h2>
      <p className="muted">
        operator <strong>{data.operator}</strong> — every claimed job for the circle, newest first.
      </p>

      <h3 style={{ marginTop: "1.2rem" }}>schedules</h3>
      <table>
        <thead><tr><th>player</th><th>email</th><th>weekdays</th><th>time</th><th>3d-next</th><th>active</th></tr></thead>
        <tbody>
          {data.schedules.map((s) => (
            <tr key={s.id}>
              <td>{s.evony_name}</td>
              <td className="muted">{s.email}</td>
              <td>{weekdayNames(s.weekdays)}</td>
              <td>{s.time}</td>
              <td>{s.gem_ack ? "acked" : "—"}</td>
              <td>{s.active ? "yes" : "no"}</td>
            </tr>
          ))}
          {data.schedules.length === 0 && <tr><td colSpan={6} className="muted">no schedules yet</td></tr>}
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
