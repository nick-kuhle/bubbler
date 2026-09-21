// app/dashboard/page.tsx — read-only schedule for a bubble member. Server component:
// reads the lang cookie, renders the dashboard dict, and pulls the schedule from
// /api/events defensively (falls back to a safe empty state if it's not ok).

import { cookies } from "next/headers";
import { t, isLang, Lang, LANG_COOKIE } from "@/lib/i18n";

type DashboardEvent = { day: number; slot: "morning" | "evening"; time: string };
type EventsResponse = { ok: boolean; events?: DashboardEvent[] };

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export default async function Dashboard() {
  const rawLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(rawLang) ? rawLang : "en";
  const dict = t(lang);

  let events: DashboardEvent[] = [];
  try {
    const res = await fetch("/api/events", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as EventsResponse;
      if (data && Array.isArray(data.events)) events = data.events;
    }
  } catch {
    events = [];
  }

  if (events.length === 0) {
    return (
      <section className="card">
        <h2>{dict.dashboard.title}</h2>
        <p className="muted">{dict.dashboard.intro}</p>
        <p>{dict.dashboard.none}</p>
        <p className="muted">{dict.dashboard.noneHint}</p>
      </section>
    );
  }

  const todayIndex = (new Date().getDay() + 6) % 7;

  return (
    <section className="card">
      <h2>{dict.dashboard.title}</h2>
      <p className="muted">{dict.dashboard.intro}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.dashboard.next}</h3>
      <table>
        <thead>
          <tr>
            <th>{dict.dashboard.columnDay}</th>
            <th>{dict.dashboard.columnMorning}</th>
            <th>{dict.dashboard.columnEvening}</th>
          </tr>
        </thead>
        <tbody>
          {DAY_KEYS.map((key, i) => {
            const morning = events.find((e) => e.day === i && e.slot === "morning");
            const evening = events.find((e) => e.day === i && e.slot === "evening");
            const isToday = i === todayIndex;
            return (
              <tr key={key}>
                <td>
                  {dict.dashboard[key]}
                  {isToday && <span className="ok"> · {dict.dashboard.today}</span>}
                </td>
                <td>{morning ? `${dict.dashboard.morning} · ${morning.time}` : <span className="muted">—</span>}</td>
                <td>{evening ? `${dict.dashboard.evening} · ${evening.time}` : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: "0.8rem" }}>
        {dict.dashboard.threeDayBubble}
      </p>
    </section>
  );
}