// events/route.ts — the long-poll the phone holds open.
//
// Contract with scheduler.ts (single name, the one IT exports: fillDue/claimNext — no
// alias churn; the compiler is the arbiter and it names this file's imports, not my
// memory of them):
//   fillDue(now)  — materialize every due schedule slot idempotently (uniq partial index)
//   claimNext()   — claim the oldest pending job or null

import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { fillDue, claimNext } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLD_MS = 40_000; // one long-hold; under Vercel Hobby's 60s default cap

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true });
}