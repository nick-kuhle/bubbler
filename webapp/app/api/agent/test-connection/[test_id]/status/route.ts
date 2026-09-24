// app/api/agent/test-connection/[test_id]/status/route.ts — the phone reporting test
// progress (mirror of /api/agent/links/[link_id]/status). Contract (agent.py run_test):
// POST Bearer, JSON { status, error? } with status one of
//   running | ok | failed
// The dashboard polls GET /api/test-connection/[id] to watch these transitions.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED = new Set(["pending", "running", "ok", "failed"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ test_id: string }> }) {
  const agent = await verifyBearer(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { test_id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; error?: string | null };
  const status = String(body.status || "");
  if (!ALLOWED.has(status)) return NextResponse.json({ ok: false, error: "bad-status" }, { status: 400 });

  await db().run(
    `UPDATE test_sessions SET state = ?, error = ? WHERE id = ?`,
    [status, body.error ?? null, test_id],
  );
  return NextResponse.json({ ok: true });
}