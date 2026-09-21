// app/api/agent/runs/route.ts — the phone reporting the bubble it just applied.
// Contract (agent.py report_run, byte-true): POST Bearer, JSON body carrying the run's
// outcome + evidence ref; answers { "ok": true, "run_id": ... }.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso } from "@/lib/id";

export async function POST(req: NextRequest) {
  const agent = await verifyBearer(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const runId = nid();
  const d = db();
  await d.run(
    `INSERT INTO runs (id, job_id, user_id, status, evidence_ref, crafted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [runId, String(body.job_id || ""), agent.id, "applied", String(body.evidence_ref || ""), nowIso()],
  );
  return NextResponse.json({ ok: true, run_id: runId });
}
