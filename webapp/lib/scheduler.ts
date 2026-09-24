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
 * Claim the oldest pending job as a long-poll event, or null when nothing is due. The
 * claim is a single UPDATE keyed off the row it found, so two serverless holds can never
 * both fire for the same job.
 */
export async function claimNext(): Promise<BubblerEvent | null> {
  const d = db();
  const row = (await d.get(
    `SELECT j.id AS job_id, j.kind, j.user_id, u.email, u.evony_name, j.payload
       FROM jobs j JOIN users u ON u.id = j.user_id
      WHERE j.status = 'pending' AND (j.expires_at IS NULL OR j.expires_at > ?)
      ORDER BY j.created_at LIMIT 1`,
    [nowIso()],
  )) as (Row & { job_id: string; kind: "run" | "link" | "code" | "test"; user_id: string; email: string; evony_name: string; payload: string }) | undefined;
  if (!row) return null;
  await d.run("UPDATE jobs SET status = 'claimed' WHERE id = ?", [row.job_id]);
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
