// app/api/agent/events/route.ts — the phone agent's long-poll door.
// Contract (phone-agent/agent.py, byte-true): GET with `Authorization: Bearer <token>`
// and optional `?hold=NN`; server holds up to ~45s, then answers
//   { "ok": true, "event": <claimNext()'s real shape or null> }
// Every poll first materializes due schedule slots (fillDue) so the scheduler runs with
// no cron — "computed at poll time" (docs/02). Each authenticated poll also stamps the
// agent heartbeat (lib/agentHealth), and `?v=VER&host=NAME&pid=N` are caught and stored
// so the dashboard can tell a healthy phone from a silent one (docs/06).
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { fillDue, claimNext } from "@/lib/scheduler";
import { touchAgentHealth } from "@/lib/agentHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby cap is 60s; our holds fit well under it.
export const maxDuration = 60;

function publicError(err: unknown): string {
  return String(err instanceof Error ? err.message : err)
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/g, "postgres://***@")
    .slice(0, 240);
}

export async function GET(req: NextRequest) {
  try {
    const agent = await verifyBearer(req);
    if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const rawHold = req.nextUrl.searchParams.get("hold");
    const holdMs = Math.min(Math.max(Number(rawHold) || 40, 5), 46) * 1000;
    const seen0 = Date.now();

    // Stamp the heartbeat at poll *start*: a healthy agent polls every ~46s, so any
    // authenticated hit here proves the phone + agent are alive.
    const meta = {
      version: req.nextUrl.searchParams.get("v") ?? undefined,
      host: req.nextUrl.searchParams.get("host") ?? undefined,
      pid: Number(req.nextUrl.searchParams.get("pid")) || undefined,
    };
    await touchAgentHealth(meta, false);

    await fillDue();
    let evt = await claimNext();
    while (!evt && Date.now() - seen0 < holdMs - 800) {
      await new Promise((r) => setTimeout(r, 1500));
      await fillDue();
      evt = await claimNext();
    }

    if (evt) await touchAgentHealth(meta, true);
    if (!evt) return NextResponse.json({ ok: true, event: null });
    return NextResponse.json({ ok: true, event: evt });
  } catch (err) {
    return NextResponse.json({ ok: false, error: publicError(err) }, { status: 500 });
  }
}
