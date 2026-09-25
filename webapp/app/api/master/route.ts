// app/api/master/route.ts — the War Room, role-aware. Operators see the full admin
// estate (via lib/adminOverview). Members see the read-only roster: each registered
// player's name, current bubble time remaining, and next scheduled bubble (N/A when
// neither applies). Emails are never exposed to members.
import { NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentHealth } from "@/lib/agentHealth";
import { buildOverview } from "@/lib/adminOverview";
import { nextSlot, shieldRemainingNow } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  if (user.is_operator) {
    return NextResponse.json({
      role: "operator",
      operator: { id: user.id, email: user.email, evony_name: user.evony_name },
      ...(await buildOverview()),
    });
  }

  const d = db();
  const players = (await d.all(
    `SELECT id, evony_name FROM users WHERE is_operator = 0 ORDER BY evony_name`,
  )) as { id: string; evony_name: string }[];

  const slots = (await d.all(
    `SELECT s.user_id, s.weekday, s.time
       FROM slots s JOIN users u ON u.id = s.user_id
      WHERE s.active = 1 AND u.is_operator = 0`,
  )) as { user_id: string; weekday: number; time: string }[];

  const latestByPlayer = new Map<string, { shield_hours_remaining: number | null; created_at: string }>();
  const runs = (await d.all(
    `SELECT r.user_id, r.shield_hours_remaining, r.created_at
       FROM runs r
       JOIN (SELECT user_id, MAX(created_at) AS m FROM runs GROUP BY user_id) x
         ON x.user_id = r.user_id AND x.m = r.created_at`,
  )) as { user_id: string; shield_hours_remaining: number | null; created_at: string }[];
  for (const r of runs) latestByPlayer.set(r.user_id, r);

  const slotsByPlayer = new Map<string, { weekday: number; time: string }[]>();
  for (const s of slots) {
    const arr = slotsByPlayer.get(s.user_id) ?? [];
    arr.push({ weekday: Number(s.weekday), time: s.time });
    slotsByPlayer.set(s.user_id, arr);
  }

  const now = new Date();
  const roster = players.map((p) => {
    const latest = latestByPlayer.get(p.id);
    const bubble = latest
      ? shieldRemainingNow(latest.shield_hours_remaining, latest.created_at, now)
      : null;
    const nxt = nextSlot(slotsByPlayer.get(p.id) ?? [], now);
    return {
      name: p.evony_name,
      bubble_hours_remaining: bubble,
      next_bubble: nxt,
    };
  });

  const agent = await agentHealth();
  const { agent_id: _agentId, ...agentStatus } = agent ?? { online: false, last_seen_at: null, last_event_at: null, version: null, hostname: null, pid: null, offline_for_ms: 0 };
  return NextResponse.json({ role: "member", roster, agent: agentStatus });
}