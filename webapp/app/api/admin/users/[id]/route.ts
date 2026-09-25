// app/api/admin/users/[id]/route.ts — operator-only user deletion. Removes the account
// and every dependent row (slots, sessions, link/test sessions, jobs, runs) atomically.
// Operators cannot be deleted (including yourself): the estate stays self-consistent.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const op = await currentUser();
  if (!op) return unauthorized();
  if (!op.is_operator) return NextResponse.json({ error: "operator-only" }, { status: 403 });
  const { id } = await params;
  const d = db();
  const target = await d.get("SELECT id, email, evony_name, is_operator FROM users WHERE id = ?", [id]);
  if (!target) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (Number(target.is_operator) === 1) {
    return NextResponse.json({ error: "cannot-delete-operator" }, { status: 409 });
  }

  try {
    await d.run("BEGIN");
    for (const t of ["slots", "sessions", "link_sessions", "test_sessions", "jobs", "runs"]) {
      await d.run(`DELETE FROM ${t} WHERE user_id = ?`, [id]);
    }
    await d.run("DELETE FROM users WHERE id = ?", [id]);
    await d.run("COMMIT");
  } catch (e) {
    await d.run("ROLLBACK").catch(() => {});
    throw e;
  }
  return NextResponse.json({ ok: true, removed: target.evony_name });
}