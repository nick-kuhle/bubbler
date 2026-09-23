export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function nextTarget(weekday: number, time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, hh, mm, 0, 0),
    );
    const wd = ((d.getUTCDay() + 6) % 7) + 1;
    if (wd === weekday && d.getTime() > now.getTime() + 1000) return d.getTime();
  }
  return 0;
}

export function nextFromSlots(slots: { weekday: number; time: string; active: boolean }[]) {
  const times = slots.filter((s) => s.active).map((s) => nextTarget(s.weekday, s.time)).filter(Boolean);
  if (!times.length) return 0;
  return Math.min(...times);
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
