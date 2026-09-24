// app/api/agent/test-connection/[test_id]/status/route.ts — the phone reporting test
// progress (mirror of /api/agent/links/[link_id]/status). Contract (agent.py run_test):
// POST Bearer, JSON { status, error?, confirmed_name?, verified? } with status one of
//   running | ok | failed
// `confirmed_name` is the name read from the game (login prompt / profile OCR) and
// `verified` says whether it matched the member's evony_name. The dashboard polls
// GET /api/test-connection/[id] to watch these transitions.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { db } from "@/lib/db";
import { markJobDoneBySession } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED = new Set(["pending", "running", "ok", "failed"]);
const TERMINAL = new Set(["ok", "failed"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ test_id: string }> }) {
  const agent = await verifyBearer(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { test_id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    error?: string | null;
    confirmed_name?: string | null;
    verified?: boolean;
  };
  const status = String(body.status || "");
  if (!ALLOWED.has(status)) return NextResponse.json({ ok: false, error: "bad-status" }, { status: 400 });

  await db().run(
    `UPDATE test_sessions
        SET state = ?, error = ?,
            confirmed_name = ?, verified = ?
      WHERE id = ?`,
    [
      status,
      body.error ?? null,
      body.confirmed_name ?? null,
      body.verified === undefined ? null : body.verified ? 1 : 0,
      test_id,
    ],
  );

  // A terminal outcome ends the job: never reclaim a failed/ok one-shot test (a redelivered
  // failed test is what looped the phone into open/close Evony on 2026-09-24).
  if (TERMINAL.has(status)) await markJobDoneBySession("test", test_id);

  return NextResponse.json({ ok: true });
}