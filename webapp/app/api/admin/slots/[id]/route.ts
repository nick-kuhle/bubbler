// app/api/admin/slots/[id]/route.ts — operator-only slot control: flip `active`.
import { NextRequest, NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const op = await currentUser();
  if (!op) return unauthorized();
  if (!op.is_operator) return NextResponse.json({ error: "operator-only" }, { status: 403 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "bad-id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { active?: boolean };
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }
  const d = db();
  const row = await d.get("SELECT id FROM slots WHERE id = ?", [id]);
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404 });
  await d.run("UPDATE slots SET active = ? WHERE id = ?", [body.active ? 1 : 0, id]);
  const updated = await d.get(
    `SELECT s.id, s.weekday, s.time, s.active, u.evony_name, u.email
       FROM slots s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [id],
  );
  return NextResponse.json({ ok: true, slot: updated });
}