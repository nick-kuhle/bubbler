// lib/slots.ts — shared slot math used by /api/me and the War Room roster.

export type SlotLite = { weekday: number; time: string };

/**
 * Smallest future (weekday, time) across ALL slots, honouring each slot's own time —
 * so Mon 09:00 / Wed 09:00 / Fri 18:00 each compete on their real next occurrence.
 * Returns { weekday, time } | null; times are UTC minutes-of-day compared strictly.
 */
export function nextSlot(slots: SlotLite[], now: Date = new Date()): SlotLite | null {
  let best: { at: number; slot: SlotLite } | null = null;
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const s of slots) {
    const [hh, mm] = s.time.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const slotMin = hh * 60 + mm;
    for (let ahead = 0; ahead < 14; ahead++) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ahead),
      );
      const wd = ((d.getUTCDay() + 6) % 7) + 1;
      if (wd !== s.weekday) continue;
      if (ahead === 0 && slotMin <= nowMin) continue; // today's slot already passed
      const at = d.getTime() + slotMin * 60_000;
      if (!best || at < best.at) best = { at, slot: { weekday: s.weekday, time: s.time } };
      break; // first future occurrence of THIS slot — next iteration is 7 days later
    }
  }
  return best ? best.slot : null;
}

/** Est. hours of shield still on the account, decaying the reported value in real time. */
export function shieldRemainingNow(
  shieldHoursAtReport: number | null,
  reportedAt: string,
  now: Date = new Date(),
): number | null {
  if (shieldHoursAtReport == null) return null;
  const elapsedH = (now.getTime() - Date.parse(reportedAt)) / 3_600_000;
  if (!Number.isFinite(elapsedH)) return null;
  return Math.max(0, shieldHoursAtReport - elapsedH);
}