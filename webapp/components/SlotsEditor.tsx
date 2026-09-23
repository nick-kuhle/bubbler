"use client";

// SlotsEditor — the shared per-slot schedule editor used by the dashboard AND the wizard.
// One row = one day + its own time (Mon 09:00 / Wed 09:00 / Fri 18:00 are three rows).
// Pure editing surface: owns no persistence — parents POST /api/schedule themselves.

import type { Dict } from "@/lib/i18n";

export type EditSlot = {
  key: number; // stable client-only row key (React + radio names)
  id?: string; // server slot id when loaded from /api/me
  weekday: number; // ISO 1=Mon … 7=Sun
  time: string; // "HH:MM" in UTC
  shield_hours: 72;
  active: boolean;
};

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_SLOTS = 7;

let keySeq = 1;

/** Build an editor row with a fresh stable key (call for defaults, adds and server loads). */
export function newSlot(init: Omit<Partial<EditSlot>, "key"> = {}): EditSlot {
  return {
    key: keySeq++,
    weekday: 1,
    time: "09:00",
    shield_hours: 72,
    active: true,
    ...init,
  };
}

// The owner's hard requirement: Mon 09:00, Wed 09:00, Fri 18:00 (UTC = Evony server time).
export const DEFAULT_SLOTS: EditSlot[] = [
  newSlot({ weekday: 1, time: "09:00" }),
  newSlot({ weekday: 3, time: "09:00" }),
  newSlot({ weekday: 5, time: "18:00" }),
];

/** /api/me slot row → editor row. Only active slots come back from the API. */
export function slotFromMe(s: {
  id: string;
  weekday: number;
  time: string;
  shield_hours: number;
  gem_ack: number;
}): EditSlot {
  return newSlot({
    id: s.id,
    weekday: s.weekday,
    time: s.time,
    shield_hours: 72,
    active: true,
  });
}

/** Mirrors the server's POST /api/schedule validation (weekday 1-7, HH:MM, 1..7 rows). */
export function slotsAreValid(slots: EditSlot[]): boolean {
  if (slots.length < 1 || slots.length > MAX_SLOTS) return false;
  return slots.every(
    (s) =>
      Number.isInteger(s.weekday) &&
      s.weekday >= 1 &&
      s.weekday <= 7 &&
      TIME_RE.test(s.time),
  );
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Next occurrence of this slot (strictly future, UTC) + its shield duration. */
function shieldUntil(s: EditSlot, now: Date = new Date()): Date | null {
  const [hh, mm] = s.time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  for (let ahead = 0; ahead < 14; ahead++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ahead, hh, mm),
    );
    const wd = ((d.getUTCDay() + 6) % 7) + 1;
    if (wd !== s.weekday) continue;
    if (d.getTime() <= now.getTime()) continue; // this week's occurrence already passed
    return new Date(d.getTime() + s.shield_hours * 3_600_000);
  }
  return null;
}

function untilLabel(s: EditSlot, dict: Dict): string {
  const until = shieldUntil(s);
  if (!until) return "—";
  const wd = ((until.getUTCDay() + 6) % 7) + 1;
  return `${dict.dashboard.short[DAY_KEYS[wd - 1]]} ${until.toISOString().slice(11, 16)}`;
}

type Props = {
  slots: EditSlot[];
  onChange: (next: EditSlot[]) => void;
  dict: Dict;
};

export default function SlotsEditor({ slots, onChange, dict }: Props) {
  const d = dict.dashboard;

  const patch = (key: number, next: Partial<EditSlot>) =>
    onChange(slots.map((s) => (s.key === key ? { ...s, ...next } : s)));

  const remove = (key: number) => onChange(slots.filter((s) => s.key !== key));

  const add = () => {
    if (slots.length >= MAX_SLOTS) return;
    // Default the new row to the first weekday not used yet (falls back to Monday).
    const used = new Set(slots.map((s) => s.weekday));
    const weekday = [1, 2, 3, 4, 5, 6, 7].find((wd) => !used.has(wd)) ?? 1;
    onChange([...slots, newSlot({ weekday, time: "09:00" })]);
  };

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>{d.dayCol}</th>
            <th>{d.timeLabel} (UTC)</th>
            <th>{d.shieldCol}</th>
            <th>{d.gemsCol}</th>
            <th>{d.shieldUntil}</th>
            <th>{d.activeCol}</th>
            <th aria-label={d.removeSlot} />
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.key} style={s.active ? undefined : { opacity: 0.55 }}>
              <td>
                <div className="day-grid" role="radiogroup" aria-label={d.dayCol}>
                  {DAY_KEYS.map((key, i) => (
                    <label key={key} className={`day-chip${s.weekday === i + 1 ? " on" : ""}`}>
                      <input
                        type="radio"
                        name={`slot-day-${s.key}`}
                        checked={s.weekday === i + 1}
                        onChange={() => patch(s.key, { weekday: i + 1 })}
                      />
                      {d.short[key]}
                    </label>
                  ))}
                </div>
              </td>
              <td>
                <input
                  type="time"
                  value={s.time}
                  aria-label={`${d.timeLabel} — ${d[DAY_KEYS[s.weekday - 1]]}`}
                  onChange={(e) => patch(s.key, { time: e.target.value })}
                />
              </td>
              <td>{d.shield72}</td>
              <td>{d.gems72}</td>
              <td className="muted">{untilLabel(s, dict)}</td>
              <td>
                <input
                  type="checkbox"
                  checked={s.active}
                  aria-label={d.activeCol}
                  onChange={(e) => patch(s.key, { active: e.target.checked })}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => remove(s.key)}
                  aria-label={`${d.removeSlot}: ${d[DAY_KEYS[s.weekday - 1]]} ${s.time}`}
                  style={{ background: "transparent", color: "var(--muted)", padding: "0.3rem 0.5rem" }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {slots.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">{d.noSlots}</td>
            </tr>
          )}
        </tbody>
      </table>

      <button
        type="button"
        onClick={add}
        disabled={slots.length >= MAX_SLOTS}
        style={{ marginTop: "0.7rem" }}
      >
        + {d.addSlot}
      </button>
    </div>
  );
}
