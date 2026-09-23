// app/api/master/route.ts — operator-only master list: every slot + run, latest first.
// Per-slot model: each (day, time) row is listed separately — no weekdays mask.
import { NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const op = await currentUser();
  if (!op) return unauthorized();
  if (!op.is_operator) return NextResponse.json({ error: "operator-only" }, { status: 403 });
  const d = db();
  const slots = await d.all(
    `SELECT s.id, s.weekday, s.time, s.user_id, u.evony_name, s.active
       FROM slots s JOIN users u ON u.id = s.user_id
      ORDER BY u.evony_name, s.weekday, s.time`,
  );
  const runs = await d.all(
    `SELECT r.id, r.trigger, r.status, r.shield_hours_remaining, r.error, r.evidence_ref, r.created_at, u.evony_name
       FROM runs r JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC LIMIT 50`,
  );
  return NextResponse.json({ operator: op.evony_name, slots, runs });
}
