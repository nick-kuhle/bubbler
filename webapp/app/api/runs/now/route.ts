// app/api/runs/now/route.ts — "Run now". Any member may run for themselves; operators may
// pass a target user_id. Enqueues a manual run job (uniq=null, so it can fire anytime).
import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso, addMinutesIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const user = await requireLogin();
  const body = (await req.json().catch(() => ({}))) as { user_id?: string };

  let targetId = user.id;
  if (body.user_id && body.user_id !== user.id) {
    await requireOperator();
    targetId = body.user_id;
  }

  await db().run(
    `INSERT INTO jobs (id, kind, user_id, payload, status, created_at, expires_at)
     VALUES (?, 'run', ?, ?, 'pending', ?, ?)`,
    [nid(), targetId, JSON.stringify({ trigger: "manual" }), nowIso(), addMinutesIso(30)],
  );
  return NextResponse.json({ ok: true });
}