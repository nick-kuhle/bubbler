// app/api/auth/logout/route.ts — end the current browser session. Always succeed (even
// with a stale/expired cookie): the whole point is to leave a clean, empty state.
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    await db().run("DELETE FROM sessions WHERE token_hash = ?", [
      createHash("sha256").update(token).digest("hex"),
    ]);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}