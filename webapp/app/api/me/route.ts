// app/api/me/route.ts — the member dashboard's single source of truth: profile, active
// slots (one row per day+time), next scheduled run (computed in UTC = Evony server time),
// and last run result.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SlotLite = { weekday: number; time: string };

/**
 * Smallest future (weekday, time) across ALL slots, honouring each slot's own time —
 * so Mon 09:00 / Wed 09:00 / Fri 18:00 each compete on their real next occurrence.
 * Returns { weekday, time } | null; times are UTC minutes-of-day compared strictly.
 */
function nextSlot(slots: SlotLite[], now: Date = new Date()): SlotLite | null {
  let best: { at: number; slot: SlotLite } | null = null;
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const s of slots) {
    const [hh, mm] = s.time.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const slotMin = hh * 60 + mm;
    for (let ahead = 0; ahead < 14; ahead++) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ahead),
      );
      const wd = ((d.getUTCDay() + 6) % 7) + 1;
      if (wd !== s.weekday) continue;
      if (ahead === 0 && slotMin <= nowMin) continue; // today's slot already passed
      const at = d.getTime() + slotMin * 60_000;
      if (!best || at < best.at) best = { at, slot: { weekday: s.weekday, time: s.time } };
      break; // first future occurrence of THIS slot — next iteration is 7 days later
    }
  }
  return best ? best.slot : null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const d = db();

  const slots = (await d.all(
    `SELECT id, weekday, time, shield_hours, gem_ack
       FROM slots
      WHERE user_id = ? AND active = 1
      ORDER BY weekday, time`,
    [user.id],
  )) as { id: string; weekday: number; time: string; shield_hours: number; gem_ack: number }[];

  const lastRun = (await d.get(
    `SELECT status, shield_hours_remaining, evidence_ref, error, duration_ms, created_at
       FROM runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [user.id],
  )) as { status: string; shield_hours_remaining: number | null; evidence_ref: string | null; error: string | null; duration_ms: number | null; created_at: string } | undefined;

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      evony_name: user.evony_name,
      is_operator: user.is_operator,
    },
    slots,
    next_run: nextSlot(slots),
    last_run: lastRun
      ? {
          status: lastRun.status,
          shield_hours_remaining: lastRun.shield_hours_remaining,
          evidence_ref: lastRun.evidence_ref,
          error: lastRun.error,
          duration_ms: lastRun.duration_ms,
          created_at: lastRun.created_at,
        }
      : null,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { email?: string; evony_name?: string };
  const email = String(body.email ?? user.email).trim().toLowerCase();
  const name = String(body.evony_name ?? user.evony_name).trim();
  if (!email.includes("@")) return NextResponse.json({ error: "bad-email" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "bad-name" }, { status: 400 });

  const d = db();
  const taken = await d.get("SELECT id FROM users WHERE email = ? AND id != ?", [email, user.id]);
  if (taken) return NextResponse.json({ error: "email-taken" }, { status: 409 });
  await d.run("UPDATE users SET email = ?, evony_name = ? WHERE id = ?", [email, name, user.id]);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, email, evony_name: name, is_operator: user.is_operator },
  });
}
