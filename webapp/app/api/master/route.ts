// app/api/master/route.ts — operator-only: every schedule + run, latest first (the
// physical "master list" the wizard/phone cards describe). Read-only for the operator
// surface; mutations go through the same API the agent uses.

import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const op = await requireOperator();
  const d = db();
  const schedules = d.all(
    `SELECT s.id, s.weekdays, s.time, s.gem_ack, s.active, u.email, u.evony_name
       FROM schedules s JOIN users u ON u.id = s.user_id
      ORDER BY u.evony_name, s.time`,
  );
  const runs = d.all(
    `SELECT r.id, r.trigger, r.status, r.shield_hours_remaining, r.error, r.created_at, u.evony_name
       FROM runs r JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC LIMIT 50`,
  );
  return NextResponse.json({ operator: op.evony_name, schedules, runs });
}