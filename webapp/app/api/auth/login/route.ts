// app/api/auth/login/route.ts — magic-link login. Email IS the login (matches Evony).
// Dev path: session issued immediately. Prod: a signed link would be emailed; same code
// shape, just the link step in between (documented in 05-security).

import { NextRequest, NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = String(body.email || "").trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "bad-email" }, { status: 400 });
  }
  const seedRaw = process.env.AUTH_SEED;
  const invited =
    !seedRaw ||
    seedRaw.split(",").map(s => s.trim().toLowerCase()).includes(email.toLowerCase());
  if (!invited) {
    return NextResponse.json({ error: "not-invited" }, { status: 403 });
  }
  const user = await ensureUser(email, /*isOperator=*/ email.toLowerCase() === (process.env.AUTH_OPERATOR || "").toLowerCase());
  return NextResponse.json({ ok: true, ...user }, { status: 200 });
}