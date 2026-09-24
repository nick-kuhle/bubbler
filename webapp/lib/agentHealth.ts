// lib/agentHealth.ts — the cloud side of the phone heartbeat.
// The phone stamps `agent_health` on every authenticated long-poll (app/api/agent/events)
// with its version/host/pid, so a silent phone is distinguishable from a healthy one
// (docs/06). "Online" is a fresh last_seen inside the poll cadence plus slack.
//
// Poll contract (phone-agent/agent.py): one long-poll every ~46s (45s hold + reconnect),
// so a 120s threshold treats that cadence as alive without false negatives.

import { db } from "./db";
import { nowIso } from "./id";

export const AGENT_ID = "main";
export const ONLINE_WINDOW_MS = 120_000;

export type AgentMeta = { version?: string; host?: string; pid?: number };

export type AgentHealth = {
  agent_id: string;
  last_seen_at: string;
  last_event_at: string | null;
  version: string | null;
  hostname: string | null;
  pid: number | null;
  online: boolean;
  offline_for_ms: number;
};

function rowInt(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export async function touchAgentHealth(meta: AgentMeta, sawEvent: boolean): Promise<void> {
  const d = db();
  const ts = nowIso();
  const version = meta.version ?? null;
  const host = meta.host ?? null;
  const pid = meta.pid ?? null;
  // last_event_at only moves forward (an event was claimed on that poll round).
  if (sawEvent) {
    await d.run(
      `INSERT INTO agent_health (agent_id, last_seen_at, last_event_at, version, hostname, pid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         last_event_at = excluded.last_event_at,
         version = excluded.version,
         hostname = excluded.hostname,
         pid = excluded.pid,
         updated_at = excluded.updated_at`,
      [AGENT_ID, ts, ts, version, host, pid, ts],
    );
  } else {
    await d.run(
      `INSERT INTO agent_health (agent_id, last_seen_at, version, hostname, pid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         last_event_at = agent_health.last_event_at,
         version = excluded.version,
         hostname = excluded.hostname,
         pid = excluded.pid,
         updated_at = excluded.updated_at`,
      [AGENT_ID, ts, version, host, pid, ts],
    );
  }
}

export async function agentHealth(): Promise<AgentHealth | null> {
  const row = await db().get(
    "SELECT agent_id, last_seen_at, last_event_at, version, hostname, pid FROM agent_health WHERE agent_id = ?",
    [AGENT_ID],
  );
  if (!row) return null;
  const lastSeen = String(row.last_seen_at);
  const offlineFor = Date.now() - Date.parse(lastSeen);
  return {
    agent_id: String(row.agent_id),
    last_seen_at: lastSeen,
    last_event_at: row.last_event_at ? String(row.last_event_at) : null,
    version: row.version ? String(row.version) : null,
    hostname: row.hostname ? String(row.hostname) : null,
    pid: rowInt(row.pid),
    online: Number.isFinite(offlineFor) && offlineFor < ONLINE_WINDOW_MS,
    offline_for_ms: Number.isFinite(offlineFor) ? Math.max(0, offlineFor) : 0,
  };
}