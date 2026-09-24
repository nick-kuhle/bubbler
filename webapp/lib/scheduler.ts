// scheduler.ts — everything is async here (it uses the async db surface) and every
// reservation is idempotent. This file, auth.ts and the routes all speak the same one
// surface: `await`. There is no sync path anymore.

import { db } from "./db";
import { nid, nowIso, addDaysIso, isoWeekday, hhmm, dayKeyUTC } from "./id";

export type BubblerEvent = {
  job_id: string;
  kind: "run" | "link" | "code" | "test";
  user_id: string;
  email: string;
  evony_name: string;
  payload: Record<string, unknown>;
};

type Row = Record<string, unknown>;

/**
 * Insert one job per `slots` row that is due right now: active AND its own weekday ==
 * today's ISO weekday AND its own time == the current HH:MM. Each slot carries its own
 * time, so Mon 09:00 / Wed 09:00 / Fri 18:00 are three independent matches. Idempotent:
 * the uniq partial index refuses a second job for the same (user, day-key, clock).
 */
export async function fillDue(now: Date = new Date()): Promise<void> {
  const d = db();
  const wd = isoWeekday(now);
  const hh = hhmm(now);
  const day = dayKeyUTC(now);
  const rows = (await d.all(
    `SELECT s.user_id, s.time
       FROM slots s JOIN users u ON u.id = s.user_id
      WHERE s.active = 1 AND s.weekday = ? AND s.time = ?`,
    [wd, hh],
  )) as (Row & { user_id: string; time: string })[];

  for (const r of rows) {
    const uniq = `${r.user_id}:${day}:${hh}`;
    const exists = await d.get("SELECT id FROM jobs WHERE uniq = ?", [uniq]);
    if (exists) continue; // this day+user+clock is already materialized
    try {
      await d.run(
        `INSERT INTO jobs (id, kind, user_id, payload, uniq, status, created_at, expires_at)
         VALUES (?, 'run', ?, '{}', ?, 'pending', ?, ?)`,
        [nid(), r.user_id, uniq, nowIso(), addDaysIso(50)],
      );
    } catch {
      // concurrent fillDue won the race; the unique index keeps slots single.
    }
  }
}

/**
 * Claim the oldest not-being-worked job as a long-poll event, or null when nothing is due.
 * The claim is a single UPDATE keyed off the row it found, so two serverless holds can
 * never both fire for the same job.
 *
 * Lease: a claimed job is stamped with `claimed_at` and is *reclaimed* (auto-redelivered)
 * once `RECLAIM_AFTER_MS` has passed without the agent reporting. So if the on-device
 * agent dies or loses its response mid-flow, the job is not stuck forever: the next poll
 * (after the supervisor restarts the agent) gets it again. Duplicate in-flight delivery
 * is guarded on the agent side (per-kind _link_lock / sync handle) and is far safer than
 * a job sitting claimed forever (docs/02 "claimed without a lease" gate).
 */
export const RECLAIM_AFTER_MS = 90_000;

/**
 * Report routes call this once a flow reaches a terminal outcome (test ok/failed,
 * link linked/failed/expired, run reported) so the job can never be reclaimed again.
 * A done job is invisible to claimNext (it only looks at pending / stale-claimed).
 */
export async function markJobDoneBySession(kind: "test" | "link", sessionId: string): Promise<void> {
  // payload is JSON, e.g. {"test_id":"AbC123"}; session ids are base62, never wildcars.
  await db().run(
    `UPDATE jobs SET status = 'done'
      WHERE kind = ? AND status IN ('pending','claimed')
        AND payload LIKE ?`,
    [kind, `%"${kind}_id":"${sessionId}"%`],
  );
}

export async function markJobDone(jobId: string): Promise<void> {
  await db().run(`UPDATE jobs SET status = 'done' WHERE id = ? AND status IN ('pending','claimed')`, [jobId]);
}

/** Terminal-session names per kind (non-terminal states stay redeliverable). */
const TERMINAL_STATE: Record<string, ReadonlySet<string>> = {
  test: new Set(["ok", "failed"]),
  link: new Set(["linked", "failed", "expired"]),
};

/**
 * Claim but refuse to hand out a job whose flow already resolved (session terminal or
 * expired) or whose run was already reported (job status done). Such stale jobs are
 * marked 'done' instead. Without this, a failed one-shot test/link job would be
 * redelivered forever by the RECLAIM_AFTER_MS lease and re-open Evony every ~90s —
 * which actually happened in prod on 2026-09-24.
 */
export async function claimPlayable(maxSkips = 25): Promise<BubblerEvent | null> {
  const d = db();
  for (let i = 0; i < maxSkips; i++) {
    const evt = await claimNext();
    if (!evt) return null;

    if (evt.kind === "test" || evt.kind === "link") {
      const sessionId = String(evt.payload[`${evt.kind}_id`] ?? "");
      if (sessionId) {
        const resolved = await sessionResolved(evt.kind, sessionId);
        if (resolved) {
          await markJobDone(evt.job_id);
          continue;
        }
      }
    }
    return evt;
  }
  return null;
}

async function sessionResolved(kind: "test" | "link", sessionId: string): Promise<boolean> {
  const d = db();
  const row = (await d.get(
    `SELECT state, expires_at FROM ${kind}_sessions WHERE id = ?`,
    [sessionId],
  )) as { state?: string; expires_at?: string | null } | undefined;
  if (!row) return true; // no session => nothing to run against, treat as stale
  if (TERMINAL_STATE[kind].has(row.state ?? "")) return true;
  // A non-terminal session whose lease lapsed is dead too (interactive link flows),
  // otherwise the reclaim lease would resurrect long-abandoned sessions.
  if (row.expires_at && row.expires_at <= new Date().toISOString()) return true;
  return false;
}

export async function claimNext(): Promise<BubblerEvent | null> {
  const d = db();
  const cutoff = new Date(Date.now() - RECLAIM_AFTER_MS).toISOString();
  const row = (await d.get(
    `SELECT j.id AS job_id, j.kind, j.user_id, u.email, u.evony_name, j.payload
       FROM jobs j JOIN users u ON u.id = j.user_id
      WHERE (j.status = 'pending'
             OR (j.status = 'claimed' AND j.claimed_at IS NOT NULL AND j.claimed_at < ?))
        AND (j.expires_at IS NULL OR j.expires_at > ?)
      ORDER BY j.created_at LIMIT 1`,
    [cutoff, nowIso()],
  )) as (Row & { job_id: string; kind: "run" | "link" | "code" | "test"; user_id: string; email: string; evony_name: string; payload: string }) | undefined;
  if (!row) return null;
  await d.run("UPDATE jobs SET status = 'claimed', claimed_at = ? WHERE id = ?", [nowIso(), row.job_id]);
  const payload = JSON.parse(row.payload || "{}") as Record<string, unknown>;
  if (row.kind === "code") {
    await d.run("UPDATE jobs SET payload = '{}' WHERE id = ?", [row.job_id]);
  }
  return {
    job_id: row.job_id,
    kind: row.kind,
    user_id: row.user_id,
    email: row.email,
    evony_name: row.evony_name,
    payload,
  };
}
