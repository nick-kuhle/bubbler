// app/api/admin/agent/restart/route.ts — operator-only: ask the agent to repair and
// relaunch itself. This is the "restart agent" button in the War Room.
//
// Vercel cannot reach the laptop, so the request travels the only channel the agent has:
// the long-poll. The agent picks the `restart` event up on its next poll (within ~46s),
// runs phone-agent/repair.py (key guard -> phone services -> SSH tunnels -> verify),
// reports the outcome to /api/agent/maintenance, and then exits so its supervisor
// (systemd Restart=always / launchd KeepAlive) relaunches a clean process.
//
// Session-cookie auth only, never verifyBearer(): the agent credential is deliberately
// granted is_operator for read-only status reporting, and this route can restart things.
import { NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso, addMinutesIso } from "@/lib/id";
import { agentHealth } from "@/lib/agentHealth";
import { publicError } from "@/lib/publicError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    const op = await currentUser();
    if (!op) return unauthorized();
    if (!op.is_operator) return NextResponse.json({ error: "operator-only" }, { status: 403 });

    const d = db();
    const health = await agentHealth();

    // One repair in flight at a time. A restart job that is claimed but never reported
    // would be redelivered by the 90s lease, so refuse to stack requests.
    const inflight = (await d.get(
      `SELECT id FROM jobs
        WHERE kind = 'restart' AND status IN ('pending','claimed')
        ORDER BY created_at DESC LIMIT 1`,
    )) as { id?: string } | undefined;
    if (inflight?.id) {
      return NextResponse.json({
        ok: true,
        queued: true,
        job_id: String(inflight.id),
        already_pending: true,
        agent_online: Boolean(health?.online),
      });
    }

    const jobId = nid();
    await d.run(
      `INSERT INTO jobs (id, kind, user_id, payload, status, created_at, expires_at)
       VALUES (?, 'restart', ?, ?, 'pending', ?, ?)`,
      [jobId, op.id, JSON.stringify({ requested_by: op.email }), nowIso(), addMinutesIso(15)],
    );

    return NextResponse.json({
      ok: true,
      queued: true,
      job_id: jobId,
      // The repair only runs if the agent is polling. Say so plainly rather than
      // implying the button fixed something when the agent is not there to receive it.
      agent_online: Boolean(health?.online),
      ...(health?.online ? {} : { warning: "agent-offline" }),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: publicError(err) }, { status: 500 });
  }
}
