// app/api/admin/users/[id]/relink/route.ts — operator-only: re-run the phone link for a
// target account. Like the wizard's link step but without touching the user's stored
// email/evony_name (which the admin already manages).
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso, addMinutesIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const op = await currentUser();
  if (!op) return unauthorized();
  if (!op.is_operator) return NextResponse.json({ error: "operator-only" }, { status: 403 });
  const { id } = await params;
  const d = db();
  const user = await d.get("SELECT id, email, evony_name FROM users WHERE id = ?", [id]);
  if (!user) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const linkId = nid();
  await d.run(
    `INSERT INTO link_sessions (id, user_id, state, created_at, expires_at)
     VALUES (?, ?, 'awaiting_phone', ?, ?)`,
    [linkId, id, nowIso(), addMinutesIso(30)],
  );
  await d.run(
    `INSERT INTO jobs (id, kind, user_id, payload, status, created_at, expires_at)
     VALUES (?, 'link', ?, ?, 'pending', ?, ?)`,
    [nid(), id, JSON.stringify({ link_id: linkId, email: user.email }), nowIso(), addMinutesIso(15)],
  );
  return NextResponse.json({ ok: true, link_id: linkId });
}