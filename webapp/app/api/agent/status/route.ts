// app/api/agent/status/route.ts — phone agent liveness, for the operator and members.
// Reads the heartbeat the agent stamps on every long-poll (lib/agentHealth). Any logged-in
// user may see it: it contains no secrets, only last-seen/version/online. The Test
// connection card and the War Room render this; see docs/06.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized, verifyBearer } from "@/lib/auth";
import { agentHealth } from "@/lib/agentHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Any logged-in member may see it, and the agent's own bearer token may too — the
  // admin self-test checks this endpoint from the laptop (read-only liveness, no secrets).
  const user = (await currentUser()) || (await verifyBearer(req));
  if (!user) return unauthorized();
  const health = await agentHealth();
  if (!health) return NextResponse.json({ ok: true, online: false, last_seen_at: null });
  const { agent_id: _agentId, ...rest } = health;
  return NextResponse.json({ ok: true, ...rest });
}