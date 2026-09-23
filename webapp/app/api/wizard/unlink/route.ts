import { NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const d = db();
  await d.run(`DELETE FROM jobs WHERE user_id = ? AND status = 'pending'`, [user.id]);
  await d.run(`DELETE FROM link_sessions WHERE user_id = ?`, [user.id]);
  await d.run(`DELETE FROM slots WHERE user_id = ?`, [user.id]);
  return NextResponse.json({ ok: true });
}
