// app/api/agent/events/route.ts — the phone agent's long-poll door.
// Contract (phone-agent/agent.py, byte-true): GET with `Authorization: Bearer <token>`
// and `?hold=NN`; the server HOLDS ~hold-2s, then answers `{ ok: true, event: <job|null> }`
// where <job> is claimNext()'s exact shape (job_id, kind, user_id, email, evony_name, payload).
// The phone reads r.json().get("event") and reports via POST /api/agent/runs.

import { NextRequest, NextResponse } from "next/server";
import { verifyBearer, requireLogin } from "@/lib/auth";
import { claimNext } from "@/lib/scheduler";

export async function GET(req: NextRequest) {
  const op = await verifyBearer();
  if (!op) return NextResponse.json({ error: "no-operator" }, { status: 401 });
  void (await requireLogin()); // session-cookie path not used by the agent; bearer is the phone's login

  const rawHold = req.nextUrl.searchParams.get("hold");
  const hold = Math.min(Math.max(Number(rawHold) || 40, 5), 50x0);

  const started = Date.now();
  let event: unknown = null;
  while (Date.now() - started < hold * 1000) {
    event = await claimNext();
    if (event) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return NextResponse.json({ ok: true, event });
}
