// app/api/auth/code/route.ts — step 1 of passwordless login: email → send one-time code.
// One route serves both register and login; the client only changes the copy around it.
// The invite list (AUTH_SEED) still gates who may request a code, so a public deployment
// can't be pestered by strangers, and the response never reveals whether an email is
// already registered.

import { NextRequest, NextResponse } from "next/server";

import { isValidEmailInvitee } from "@/lib/auth";
import { sendCodeEmail } from "@/lib/mail";
import { requestCode } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "bad-email" }, { status: 400 });
  }
  if (!isValidEmailInvitee(email)) {
    return NextResponse.json({ error: "not-invited" }, { status: 403 });
  }

  let code: string;
  try {
    code = await requestCode(email);
  } catch (e) {
    const key = e instanceof Error ? e.message : "request-failed";
    if (key === "bad-email") return NextResponse.json({ error: "bad-email" }, { status: 400 });
    if (key === "rate-limit" || key === "cooldown") {
      return NextResponse.json({ error: key }, { status: 429 });
    }
    throw e;
  }

  let sent: Awaited<ReturnType<typeof sendCodeEmail>>;
  try {
    sent = await sendCodeEmail(email, code);
  } catch (e) {
    console.error("sendCodeEmail failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "send-failed" }, { status: 502 });
  }

  if (!sent.ok) {
    // No provider configured. Fail closed in production; local dev gets the code inline.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "email-not-configured" }, { status: 503 });
    }
    console.info(`[dev] login code for ${email}: ${code}`);
    return NextResponse.json({ ok: true, sent: false, provider: "none", dev_code: code });
  }

  return NextResponse.json({ ok: true, sent: true, provider: sent.provider });
}