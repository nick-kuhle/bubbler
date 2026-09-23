// app/api/wizard/link/route.ts — wizard step 2: kick off an interactive Evony link.
// Creates a link_session (state machine) + a jobs.link event the phone picks up on the
// long-poll (≈1s later). The phone launches Evony, taps the email-login loading-screen
// button, types the email, taps "send code" — then waits for the code event.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso, addSecondsIso, addMinutesIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { evony_name?: string; email?: string };

  const email = String(body.email || user.email).trim().toLowerCase();
  const name = String(body.evony_name || "").trim();
  if (!email.includes("@")) return NextResponse.json({ error: "bad-email" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "bad-name" }, { status: 400 });

  const d = db();
  await d.run("UPDATE users SET evony_name = ?, email = ? WHERE id = ?", [name, email, user.id]);

  const linkId = nid();
  await d.run(
    `INSERT INTO link_sessions (id, user_id, state, created_at, expires_at)
     VALUES (?, ?, 'awaiting_phone', ?, ?)`,
    [linkId, user.id, nowIso(), addMinutesIso(15)],
  );
  // One link job. The code event (created when the user submits the 6 digits) may follow.
  await d.run(
    `INSERT INTO jobs (id, kind, user_id, payload, status, created_at, expires_at)
     VALUES (?, 'link', ?, ?, 'pending', ?, ?)`,
    [nid(), user.id, JSON.stringify({ link_id: linkId, email }), nowIso(), addMinutesIso(10)],
  );

  return NextResponse.json({ ok: true, link_id: linkId, state: "awaiting_phone" });
}