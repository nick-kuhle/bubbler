import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ run_id: string }> }) {
  const operator = await verifyBearer(req);
  if (!operator) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { run_id } = await params;
  const buf = await req.arrayBuffer();
  return NextResponse.json({ ok: true, run_id, bytes: buf.byteLength });
}
