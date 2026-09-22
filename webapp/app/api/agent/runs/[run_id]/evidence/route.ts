// app/api/agent/runs/[run_id]/evidence/route.ts — the evidence-PNG door.
// Contract (phone-agent/agent.py upload_evidence): POST Bearer, body = raw PNG bytes,
// answered with { "ok": true, "run_id", "url" }. Proof is stored on Vercel Blob and the
// run row is updated with the public URL so the dashboard can show it.
import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { put, type PutCommandOptions } from "@vercel/blob";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ run_id: string }> }) {
  const agent = await verifyBearer(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { run_id } = await params;

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }

  const blob = await put(
    `evidence/${run_id}/${Date.now()}.png`,
    buf,
    { access: "public", contentType: "image/png", allowOverwrite: true } as PutCommandOptions,
  );

  await db().run(`UPDATE runs SET evidence_ref = ? WHERE id = ?`, [blob.url, run_id]);
  return NextResponse.json({ ok: true, run_id, url: blob.url });
}