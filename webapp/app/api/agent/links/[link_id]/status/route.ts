// app/api/agent/links/[link_id]/status/route.ts — the phone reporting link progress.
// Contract (agent.py report_link): POST Bearer, JSON { status, error? } with status one of
//   awaiting_code | linked | failed | expired
// The wizard polls GET /api/wizard/link/[id] to watch these transitions.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { db } from "@/lib/db";
import { markJobDoneBySession } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED = new Set(["awaiting_phone", "awaiting_code", "linked", "failed", "expired"]);
const TERMINAL = new Set(["linked", "failed", "expired"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ link_id: string }> }) {
  const agent = await verifyBearer(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { link_id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; error?: string | null };
  const status = String(body.status || "");
  if (!ALLOWED.has(status)) return NextResponse.json({ ok: false, error: "bad-status" }, { status: 400 });

  await db().run(
    `UPDATE link_sessions
        SET state = ?, error = ?
      WHERE id = ?`,
    [status, body.error ?? null, link_id],
  );

  // Terminal outcomes end the job so a linked/failed/expired session is never reclaimed.
  if (TERMINAL.has(status)) await markJobDoneBySession("link", link_id);

  return NextResponse.json({ ok: true });
}