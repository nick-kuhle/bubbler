// app/api/agent/runs/route.ts — the phone reporting the bubble it just applied.
// Contract (agent.py report_run, byte-true): POST Bearer, JSON body carrying the run's
// outcome; answers { "ok": true, "run_id": ... }. Evidence is uploaded separately to
// /api/agent/runs/[run_id]/evidence.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const agent = await verifyBearer(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    job_id?: string;
    status?: string;
    shield_hours_remaining?: number | null;
    error?: string | null;
    duration_ms?: number;
    trigger?: string;
  };

  const runId = nid();
  const d = db();
  // Attribute the run to the job's member; fall back to the agent's session user.
  let runUserId = agent.id;
  if (body.job_id) {
    const job = await d.get("SELECT user_id FROM jobs WHERE id = ?", [String(body.job_id)]);
    if (job) runUserId = String(job.user_id);
  }
  await d.run(
    `INSERT INTO runs (id, job_id, user_id, trigger, status, shield_hours_remaining, evidence_ref, error, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
    [
      runId,
      String(body.job_id || ""),
      runUserId,
      String(body.trigger || "schedule"),
      String(body.status || "applied"),
      body.shield_hours_remaining ?? null,
      body.error ?? null,
      body.duration_ms ?? null,
      nowIso(),
    ],
  );
  return NextResponse.json({ ok: true, run_id: runId });
}