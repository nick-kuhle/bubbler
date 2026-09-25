// app/api/admin/overview/route.ts — operator-only: the whole estate in one shot.
import { NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { buildOverview } from "@/lib/adminOverview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const op = await currentUser();
  if (!op) return unauthorized();
  if (!op.is_operator) return NextResponse.json({ error: "operator-only" }, { status: 403 });
  return NextResponse.json({ operator: { id: op.id, email: op.email, evony_name: op.evony_name }, ...(await buildOverview()) });
}