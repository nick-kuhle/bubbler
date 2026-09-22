// app/api/wizard/link/[link_id]/code/route.ts — wizard step 3: submit the 6-digit code.
// The code is delivered to the phone as a jobs.code event over the same long-poll, with a
// short TTL (the Evony ~90s entry window). Delivered once, never stored or logged.
import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso, addSecondsIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CODE_TTL_SECONDS = 95;

export async function POST(req: NextRequest, { params }: { params: Promise<{ link_id: string }> }) {
  const user = await requireLogin();
  const { link_id } = await params;
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "bad-code" }, { status: 400 });
  }

  const d = db();
  const link = await d.get(
    `SELECT id FROM link_sessions WHERE id = ? AND user_id = ? AND state IN ('awaiting_phone', 'awaiting_code')`,
    [link_id, user.id],
  );
  if (!link) return NextResponse.json({ error: "not-found" }, { status: 404 });

  // Transient delivery row: expires a few seconds after the in-game window, claimed once.
  await d.run(
    `INSERT INTO jobs (id, kind, user_id, payload, status, created_at, expires_at)
     VALUES (?, 'code', ?, ?, 'pending', ?, ?)`,
    [nid(), user.id, JSON.stringify({ link_id, code }), nowIso(), addSecondsIso(CODE_TTL_SECONDS)],
  );
  return NextResponse.json({ ok: true });
}