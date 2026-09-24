// app/api/test-connection/route.ts — "Test connection".
// Creates a test_session (state machine) + a jobs.test event the phone picks up on the
// long-poll. The phone opens Evony, signs in as the member's email and reports the result;
// the dashboard polls GET /api/test-connection/[id] to watch the transition.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso, addMinutesIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TEST_TTL_MINUTES = 30;

export async function POST(_req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const d = db();
  const testId = nid();
  await d.run(
    `INSERT INTO test_sessions (id, user_id, state, created_at, expires_at)
     VALUES (?, ?, 'pending', ?, ?)`,
    [testId, user.id, nowIso(), addMinutesIso(TEST_TTL_MINUTES)],
  );
  await d.run(
    `INSERT INTO jobs (id, kind, user_id, payload, status, created_at, expires_at)
     VALUES (?, 'test', ?, ?, 'pending', ?, ?)`,
    [nid(), user.id,
     JSON.stringify({ test_id: testId, email: user.email, evony_name: user.evony_name }),
     nowIso(), addMinutesIso(TEST_TTL_MINUTES)],
  );
  return NextResponse.json({ ok: true, test_id: testId });
}