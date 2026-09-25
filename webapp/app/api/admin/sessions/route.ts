// app/api/admin/sessions/route.ts — operator-only: cut every session a user holds, or
// optionally just one session by id. The phone is fatbearer — its next poll fails with
// 401 and it stops claiming jobs until re-linked.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function DELETE(req: NextRequest) {
  const op = await currentUser();
  if (!op) return unauthorized();
  if (!op.is_operator) return NextResponse.json({ error: "operator-only" }, { status: 403 });
  const user_id = req.nextUrl.searchParams.get("user_id");
  const session_id = req.nextUrl.searchParams.get("session_id");
  const d = db();
  if (session_id) {
    const r = await d.run("DELETE FROM sessions WHERE id = ?", [session_id]);
    return NextResponse.json({ ok: true, removed: session_id });
  }
  if (!user_id) return NextResponse.json({ error: "need user_id or session_id" }, { status: 400 });
  const target = await d.get("SELECT id FROM users WHERE id = ?", [user_id]);
  if (!target) return NextResponse.json({ error: "not-found" }, { status: 404 });
  await d.run("DELETE FROM sessions WHERE user_id = ?", [user_id]);
  return NextResponse.json({ ok: true, user_id });
}