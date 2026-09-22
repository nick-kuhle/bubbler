// app/api/wizard/link/[link_id]/route.ts — poll a link_session's state.
import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ link_id: string }> }) {
  const user = await requireLogin();
  const { link_id } = await params;
  const row = await db().get(
    `SELECT state, error, created_at, expires_at FROM link_sessions WHERE id = ? AND user_id = ?`,
    [link_id, user.id],
  );
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const state = String(row.state);
  const expired = new Date(String(row.expires_at)).getTime() < Date.now();
  return NextResponse.json({
    ok: true,
    state: expired && state !== "linked" ? "expired" : state,
    error: row.error ?? null,
  });
}