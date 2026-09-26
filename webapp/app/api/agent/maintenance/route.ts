// app/api/agent/maintenance/route.ts — the agent reports the outcome of a stack repair
// (the War Room "restart agent" button). Bearer-authenticated like every other agent
// route. Two jobs happen here: the outcome is recorded as a `runs` row with
// trigger='maintenance' so the War Room can show the last repair, and the job is marked
// done — without that the RECLAIM_AFTER_MS lease would redeliver the restart request
// every 90s and the agent would restart itself in a loop.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { db } from "@/lib/db";
import { nid, nowIso } from "@/lib/id";
import { markJobDone } from "@/lib/scheduler";
import { publicError } from "@/lib/publicError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Step = { name?: unknown; ok?: unknown; detail?: unknown };

export async function POST(req: NextRequest) {
  try {
    const agent = await verifyBearer(req);
    if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      job_id?: unknown; status?: unknown; steps?: unknown; duration_ms?: unknown; error?: unknown;
    };

    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    const status = body.status === "ok" ? "ok" : "failed";
    const steps = Array.isArray(body.steps)
      ? (body.steps as Step[]).slice(0, 20).map((s) => ({
          name: String(s?.name ?? "step").slice(0, 60),
          ok: Boolean(s?.ok),
          detail: String(s?.detail ?? "").slice(0, 300),
        }))
      : [];
    const error = typeof body.error === "string" ? body.error.slice(0, 500) : null;
    const duration = Number.isFinite(Number(body.duration_ms)) ? Number(body.duration_ms) : null;

    // The restart job belongs to the operator who clicked the button.
    let userId = "agent";
    if (jobId) {
      const job = (await db().get("SELECT user_id FROM jobs WHERE id = ?", [jobId])) as
        | { user_id?: string } | undefined;
      if (job?.user_id) userId = String(job.user_id);
    }
    if (userId === "agent") {
      const op = (await db().get("SELECT id FROM users WHERE is_operator = 1 ORDER BY created_at LIMIT 1")) as
        | { id?: string } | undefined;
      if (op?.id) userId = String(op.id);
    }
    if (!userId || userId === "agent") {
      return NextResponse.json({ ok: false, error: "no-user-for-maintenance-row" }, { status: 409 });
    }

    // steps are folded into the error column so the War Room has one place to read.
    const summary = steps.length
      ? steps.map((s) => `${s.ok ? "ok" : "FAIL"} ${s.name}${s.detail ? ` — ${s.detail}` : ""}`).join(" | ")
      : "";

    const runId = nid();
    await db().run(
      `INSERT INTO runs (id, job_id, user_id, trigger, status, error, duration_ms, created_at)
       VALUES (?, ?, ?, 'maintenance', ?, ?, ?, ?)`,
      [runId, jobId || null, userId, status, summary || error, duration, nowIso()],
    );

    // Mark the job done so the lease cannot redeliver the restart request.
    if (jobId) await markJobDone(jobId);

    return NextResponse.json({ ok: true, run_id: runId });
  } catch (err) {
    return NextResponse.json({ ok: false, error: publicError(err) }, { status: 500 });
  }
}
