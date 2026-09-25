// lib/otp.ts — passwordless email login via one-time 6-digit codes.
//
// A code request creates a fresh random 6-digit code, stores only its SHA-256 hash,
// and returns the clear text so the mail layer can send it (mail.ts holds no DB
// access). Verification looks up the newest unconsumed, unexpired code for the email,
// bumps a per-code attempt counter, and compares hashes in constant time.
//
// Codes live 10 minutes, die after 5 wrong guesses, and are invalidated whenever a
// new code is requested for the same email. Requesting is rate-limited per email so a
// mistake can't drive a mail-delivery bill or hammer the provider.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { db } from "./db";
import { addMinutesIso, nid, nowIso } from "./id";

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_WINDOW = 5;
export const COOLDOWN_SECONDS = 30;
const WINDOW_MS = 10 * 60_000;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Prune codes older than a day (keeps email_codes small on first party apps). */
async function prune(email: string): Promise<void> {
  const d = db();
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  await d.run("DELETE FROM email_codes WHERE email = ? AND expires_at < ?", [email, cutoff]);
}

/**
 * Issue a fresh code for `email`. Returns the clear-text code to deliver by mail.
 * Throws `Error` with a stable message key (`rate-limit`, `too-many`) the route maps
 * to a response; callers should re-throw nothing else.
 */
export async function requestCode(email: string): Promise<string> {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) throw new Error("bad-email");

  const d = db();
  await prune(e);

  // Window guard: too many codes in the last 10 minutes?
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const recent = await d.get(
    `SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > ?`,
    [e, windowStart],
  );
  if (Number(recent?.n ?? 0) >= MAX_CODES_PER_WINDOW) throw new Error("rate-limit");

  // Cooldown: at least 30s between requests for the same email.
  const newest = await d.get(
    `SELECT created_at FROM email_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
    [e],
  );
  if (newest) {
    const ageMs = Date.now() - Date.parse(String(newest.created_at));
    if (Number.isFinite(ageMs) && ageMs < COOLDOWN_SECONDS * 1_000) throw new Error("cooldown");
  }

  // Invalidate any codes still pending for this email.
  await d.run("DELETE FROM email_codes WHERE email = ? AND consumed = 0", [e]);

  const code = generateCode();
  await d.run(
    "INSERT INTO email_codes (id, email, code_hash, attempts, consumed, created_at, expires_at) VALUES (?, ?, ?, 0, 0, ?, ?)",
    [nid(), e, sha256(code).toString("hex"), nowIso(), addMinutesIso(CODE_TTL_MINUTES)],
  );
  return code;
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

/** Verify `code` for `email`; on success the code is consumed (single use). */
export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  const e = String(email || "").trim().toLowerCase();
  const c = String(code || "").trim();
  if (!e || !e.includes("@")) return { ok: false, error: "bad-email" };
  if (!/^\d{6}$/.test(c)) return { ok: false, error: "bad-code" };

  const d = db();
  const row = await d.get(
    `SELECT id, code_hash, attempts, consumed, expires_at
       FROM email_codes WHERE email = ? AND consumed = 0 AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`,
    [e, nowIso()],
  );
  if (!row) return { ok: false, error: "no-code" };

  const id = String(row.id);
  const attempts = Number(row.attempts);
  if (attempts >= MAX_ATTEMPTS) {
    await d.run("UPDATE email_codes SET consumed = 1 WHERE id = ?", [id]);
    return { ok: false, error: "too-many" };
  }
  await d.run("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?", [id]);

  const guess = sha256(c);
  const stored = Buffer.from(String(row.code_hash), "hex");
  if (!safeEqual(guess, stored)) {
    if (attempts + 1 >= MAX_ATTEMPTS) {
      await d.run("UPDATE email_codes SET consumed = 1 WHERE id = ?", [id]);
      return { ok: false, error: "too-many" };
    }
    return { ok: false, error: "bad-code" };
  }

  await d.run("UPDATE email_codes SET consumed = 1 WHERE id = ?", [id]);
  return { ok: true };
}