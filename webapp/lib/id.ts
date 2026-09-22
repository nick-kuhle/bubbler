// Tiny URL-safe id helpers + UTC scheduling primitives shared by scheduler + API.

export function nid(bytes = 10): string {
  const raw = cryptoRandomBytes(bytes);
  return Buffer.from(raw).toString("base64url");
}

import { randomBytes as cryptoRandomBytes } from "node:crypto";

export function cuid(): string {
  return nid(12);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDaysIso(days: number, from = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export function addSecondsIso(sec: number, from = new Date()): string {
  return new Date(from.getTime() + sec * 1_000).toISOString();
}

export function addMinutesIso(min: number, from = new Date()): string {
  return new Date(from.getTime() + min * 60_000).toISOString();
}

// --- weekday helpers (ISO: Mon=1 … Sun=7) -----------------------------

/** Bitmask where Mon=bit0 … Sun=bit6 → weekday `d` is bit (d-1). */
export function weekdayBit(d: number): number {
  return 1 << (d - 1);
}

/** true if `mask` contains ISO weekday `d`. */
export function maskHas(mask: number, d: number): boolean {
  return (mask & weekdayBit(d)) !== 0;
}

export function isoWeekday(d: Date = new Date()): number {
  // JS getDay(): 0=Sun…6=Sat → ISO 1=Mon…7=Sun
  return ((d.getDay() + 6) % 7) + 1;
}

/** "HH:MM" from a scheduled time string like "08:30". */
export function hhmm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

/** today's date key (UTC) e.g. "2026-03-09" — used for idempotent job slots. */
export function dayKeyUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}