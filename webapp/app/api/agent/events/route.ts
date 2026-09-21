// app/api/agent/events/route.ts — the phone agent's long-poll door.
// Contract (phone-agent/agent.py, byte-true): GET with `Authorization: Bearer <token>`
// and optional `?hold=NN`; server holds up to ~45s, then answers
//   { "ok": true, "event": <claimNext()'s real shape or null> }
// where the event shape IS lib/scheduler.ts claimNext()'s return, verbatim:
// { job_id, kind: "run"|"link"|"code", user_id, email, evony_name, payload }.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { claimNext } from "@/lib/scheduler";

export async function GET(req: NextRequest) {
  const agent = await verifyBearer(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const rawHold = req.nextUrl.searchParams.get("hold");
  const holdMs = Math.min(Math.max(Number(rawHold) || 40, 5), 50) * 1000;
  const seen0 = Date.now();

  let evt = await claimNext();
  while (!evt && Date.now() - seen0 < holdMs - 500) {
    await new Promise((r) => setTimeout(r, 1500));
    evt = await claimNext();
  }

  if (!evt) return NextResponse.json({ ok: true, event: null });
  return NextResponse.json({ ok: true, event: evt });
}
