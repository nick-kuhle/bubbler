// app/api/schedule/route.ts — replace the member's bubble schedule (wizard + dashboard).
// Per-slot model: body { slots: [{ weekday, time, shield_hours?, active? }], shield_hours?,
// gem_ack?, active? }. Sending `slots` REPLACES every slot row the user owns (delete all +
// insert). Sending only { active } toggles all of the user's slots without touching them.
// weekday: ISO 1=Mon … 7=Sun. time: "HH:MM" in UTC (= Evony server time). 1..7 slots.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type BodySlot = { weekday?: number; time?: string; shield_hours?: number; active?: boolean };

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    slots?: BodySlot[];
    shield_hours?: number;
    gem_ack?: boolean;
    active?: boolean;
  };

  const d = db();

  // Toggle-only call: flip `active` on every existing slot, replace nothing.
  if (!Array.isArray(body.slots)) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "bad-body" }, { status: 400 });
    }
    await d.run(`UPDATE slots SET active = ? WHERE user_id = ?`, [body.active ? 1 : 0, user.id]);
    return NextResponse.json({ ok: true });
  }

  const slots = body.slots;
  if (slots.length < 1 || slots.length > 7) {
    return NextResponse.json({ error: "bad-slots-count" }, { status: 400 });
  }

  const defaultShield = body.shield_hours === undefined ? 72 : Number(body.shield_hours);
  if (defaultShield !== 24 && defaultShield !== 72) {
    return NextResponse.json({ error: "bad-shield" }, { status: 400 });
  }
  // gem acknowledgement defaults to yes: reaching this route means the user pressed
  // save/confirm next to the gem-cost copy.
  const defaultAck = body.gem_ack === undefined ? 1 : body.gem_ack ? 1 : 0;
  const defaultActive = body.active === false ? 0 : 1;

  type ValidSlot = { weekday: number; time: string; shield_hours: number; active: number; gem_ack: number };
  const valid: ValidSlot[] = [];
  for (const s of slots) {
    const weekday = Number(s.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      return NextResponse.json({ error: "bad-weekday" }, { status: 400 });
    }
    const time = String(s.time ?? "");
    if (!TIME_RE.test(time)) return NextResponse.json({ error: "bad-time" }, { status: 400 });
    const shield = s.shield_hours === undefined ? defaultShield : Number(s.shield_hours);
    if (shield !== 24 && shield !== 72) {
      return NextResponse.json({ error: "bad-shield" }, { status: 400 });
    }
    valid.push({
      weekday,
      time,
      shield_hours: shield,
      active: s.active === false ? 0 : defaultActive,
      gem_ack: defaultAck,
    });
  }

  // Replace-all: the posted list IS the user's schedule from now on.
  await d.run(`DELETE FROM slots WHERE user_id = ?`, [user.id]);
  const at = nowIso();
  for (const s of valid) {
    await d.run(
      `INSERT INTO slots (id, user_id, weekday, time, shield_hours, gem_ack, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nid(), user.id, s.weekday, s.time, s.shield_hours, s.gem_ack, s.active, at],
    );
  }
  return NextResponse.json({ ok: true });
}
