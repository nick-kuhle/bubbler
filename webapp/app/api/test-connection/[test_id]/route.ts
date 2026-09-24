// app/api/test-connection/[test_id]/route.ts — poll a test_session's state.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ test_id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { test_id } = await params;
  const row = await db().get(
    `SELECT state, error, expires_at FROM test_sessions WHERE id = ? AND user_id = ?`,
    [test_id, user.id],
  );
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const state = String(row.state);
  const expired = new Date(String(row.expires_at)).getTime() < Date.now();
  const final = expired && state !== "ok" && state !== "failed" ? "expired" : state;
  return NextResponse.json({
    ok: true,
    state: final,
    error: row.error ?? null,
  });
}