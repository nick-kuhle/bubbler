// lib/adminOverview.ts — the operator's full-estate snapshot: accounts (with their last
// link/run state + slot counts), slots, sessions, link/test sessions, jobs, runs, agent
// liveness and headline counts. Shared by /api/admin/overview and /api/master (operator
// branch) so there is exactly one place that describes the estate.
import { db } from "./db";
import { agentHealth } from "./agentHealth";

export async function buildOverview() {
  const d = db();
  const field = async (sql: string): Promise<number> => {
    const r = await d.get(sql);
    return Number(r?.n ?? 0);
  };
  const accounts = await d.all(
    `SELECT u.id, u.email, u.evony_name, u.is_operator, u.created_at,
            (SELECT COUNT(*) FROM slots s WHERE s.user_id = u.id) AS slot_count,
            (SELECT COUNT(*) FROM slots s WHERE s.user_id = u.id AND s.active = 1) AS active_slots,
            (SELECT state FROM link_sessions ls WHERE ls.user_id = u.id ORDER BY ls.created_at DESC LIMIT 1) AS last_link_state,
            (SELECT r.status FROM runs r WHERE r.user_id = u.id ORDER BY r.created_at DESC LIMIT 1) AS last_run_status
       FROM users u
      ORDER BY u.is_operator DESC, u.created_at`,
  );
  const slots = await d.all(
    `SELECT s.id, s.user_id, u.evony_name, s.weekday, s.time, s.active
       FROM slots s JOIN users u ON u.id = s.user_id
      ORDER BY u.evony_name, s.weekday, s.time`,
  );
  const sessions = await d.all(
    `SELECT se.id, se.user_id, u.email, se.expires_at, se.created_at
       FROM sessions se JOIN users u ON u.id = se.user_id
      ORDER BY se.created_at DESC LIMIT 100`,
  );
  const linkSessions = await d.all(
    `SELECT ls.id, ls.user_id, u.email, ls.state, ls.error, ls.created_at, ls.expires_at
       FROM link_sessions ls JOIN users u ON u.id = ls.user_id
      ORDER BY ls.created_at DESC LIMIT 20`,
  );
  const testSessions = await d.all(
    `SELECT ts.id, ts.user_id, u.email, ts.state, ts.error, ts.verified, ts.created_at
       FROM test_sessions ts JOIN users u ON u.id = ts.user_id
      ORDER BY ts.created_at DESC LIMIT 20`,
  );
  const jobs = await d.all(
    `SELECT j.id, j.kind, j.status, j.user_id, u.email, j.created_at, j.claimed_at
       FROM jobs j JOIN users u ON u.id = j.user_id
      ORDER BY j.created_at DESC LIMIT 50`,
  );
  const runs = await d.all(
    `SELECT r.id, r.trigger, r.status, r.shield_hours_remaining, r.evidence_ref, r.error, r.duration_ms, r.created_at, u.evony_name
       FROM runs r JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC LIMIT 50`,
  );
  const agent = await agentHealth();
  const { agent_id: _agentId, ...agentStatus } = agent ?? { online: false, last_seen_at: null, last_event_at: null, version: null, hostname: null, pid: null, offline_for_ms: 0 };
  const counts = {
    users: await field("SELECT COUNT(*) AS n FROM users"),
    sessions: await field("SELECT COUNT(*) AS n FROM sessions"),
    link_sessions: await field("SELECT COUNT(*) AS n FROM link_sessions"),
    test_sessions: await field("SELECT COUNT(*) AS n FROM test_sessions"),
    jobs: await field("SELECT COUNT(*) AS n FROM jobs"),
    jobs_pending: await field("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending','claimed')"),
    runs: await field("SELECT COUNT(*) AS n FROM runs"),
  };
  return { counts, accounts, slots, sessions, link_sessions: linkSessions, test_sessions: testSessions, jobs, runs, agent: agentStatus };
}