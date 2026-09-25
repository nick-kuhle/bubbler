// app/api/auth/login/route.ts — step 2 of passwordless login: verify the emailed code
// and start a session. Passing a correct code both logs in an existing user and, for a
// brand-new email, creates the account (matches Evony's "email IS the login"). Returns
// `created` so the client can route new users to the Link-Account wizard.

import { NextRequest, NextResponse } from "next/server";

import { ensureUser } from "@/lib/auth";
import { verifyCode } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim();

  const result = await verifyCode(email, code);
  if (!result.ok) {
    const status = result.error === "bad-email" ? 400 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  const { user, created } = await ensureUser(
    email,
    /*isOperator=*/ email === (process.env.AUTH_OPERATOR || "").toLowerCase(),
  );

  return NextResponse.json({
    ok: true,
    created,
    id: user.id,
    email: user.email,
    evony_name: user.evony_name,
    is_operator: user.is_operator,
  });
}
