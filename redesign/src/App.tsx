import { useEffect, useMemo, useState } from "react";
import { BottomNav, Bubbles, Footer, Header } from "./components/Chrome";
import Login from "./views/Login";
import Dashboard, { DEFAULT_SLOTS } from "./views/Dashboard";
import Wizard from "./views/Wizard";
import Master from "./views/Master";
import Info from "./views/Info";
import { uid } from "./lib/time";
import type { Lang, Member, Run, Slot, User, View } from "./lib/types";
import { t } from "./lib/i18n";

const KEY = "lol-bubbler-preview";

type Persist = {
  lang: Lang;
  user: User | null;
  view: View;
  slots: Slot[];
  lastRun: Run | null;
};

function load(): Persist {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("empty");
    return JSON.parse(raw) as Persist;
  } catch {
    return { lang: "en", user: null, view: "login", slots: DEFAULT_SLOTS(), lastRun: seedLast() };
  }
}

function seedLast(): Run {
  const created = new Date(Date.now() - 4 * 3600000).toISOString();
  return {
    id: uid(),
    player: "PinkKeep",
    kind: "scheduled",
    status: "ok",
    shieldHoursRemaining: 68,
    createdAt: created,
  };
}

function seedMembers(you: User, slots: Slot[], last: Run | null): Member[] {
  return [
    { evonyName: you.evonyName, slots, lastRun: last },
    {
      evonyName: "JesterKing",
      slots: DEFAULT_SLOTS(),
      lastRun: {
        id: uid(),
        player: "JesterKing",
        kind: "scheduled",
        status: "ok",
        shieldHoursRemaining: 51,
        createdAt: new Date(Date.now() - 20 * 3600000).toISOString(),
      },
    },
    {
      evonyName: "BubbleQueen",
      slots: [
        { id: uid(), weekday: 1, time: "09:00", shieldHours: 72, active: true },
        { id: uid(), weekday: 5, time: "18:00", shieldHours: 72, active: true },
      ],
      lastRun: {
        id: uid(),
        player: "BubbleQueen",
        kind: "manual",
        status: "queued",
        shieldHoursRemaining: null,
        createdAt: new Date().toISOString(),
      },
    },
    {
      evonyName: "SleepyKeep",
      slots: [{ id: uid(), weekday: 3, time: "09:00", shieldHours: 72, active: true }],
      lastRun: {
        id: uid(),
        player: "SleepyKeep",
        kind: "scheduled",
        status: "failed",
        shieldHoursRemaining: null,
        createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
      },
    },
    {
      evonyName: "GiggleLord",
      slots: DEFAULT_SLOTS(),
      lastRun: {
        id: uid(),
        player: "GiggleLord",
        kind: "scheduled",
        status: "ok",
        shieldHoursRemaining: 70,
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      },
    },
  ];
}

export default function App() {
  const boot = useMemo(() => load(), []);
  const [lang, setLang] = useState<Lang>(boot.lang);
  const [view, setView] = useState<View>(boot.user ? boot.view : "login");
  const [user, setUser] = useState<User | null>(boot.user);
  const [slots, setSlots] = useState<Slot[]>(boot.slots?.length ? boot.slots : DEFAULT_SLOTS());
  const [lastRun, setLastRun] = useState<Run | null>(boot.lastRun);
  const [runs, setRuns] = useState<Run[]>(() => {
    const extra: Run[] = [
      seedLast(),
      {
        id: uid(),
        player: "JesterKing",
        kind: "scheduled",
        status: "ok",
        shieldHoursRemaining: 51,
        createdAt: new Date(Date.now() - 20 * 3600000).toISOString(),
      },
      {
        id: uid(),
        player: "GiggleLord",
        kind: "scheduled",
        status: "ok",
        shieldHoursRemaining: 70,
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      },
      {
        id: uid(),
        player: "SleepyKeep",
        kind: "scheduled",
        status: "failed",
        shieldHoursRemaining: null,
        createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
      },
    ];
    return extra.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  const [runBusy, setRunBusy] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ lang, user, view: user ? view : "login", slots, lastRun }));
    } catch {
      /* storage unavailable (private mode / sandboxed iframe) — preview still works */
    }
  }, [lang, user, view, slots, lastRun]);

  const members = useMemo(
    () => (user ? seedMembers(user, slots, lastRun) : []),
    [user, slots, lastRun],
  );

  function enter(u: User) {
    setUser(u);
    setView("dashboard");
    if (lastRun) setLastRun({ ...lastRun, player: u.evonyName });
  }

  function out() {
    setUser(null);
    setView("login");
    setRunMsg(null);
  }

  function runNow() {
    if (!user) return;
    setRunBusy(true);
    setRunMsg(null);
    window.setTimeout(() => {
      const run: Run = {
        id: uid(),
        player: user.evonyName,
        kind: "manual",
        status: "ok",
        shieldHoursRemaining: 72,
        createdAt: new Date().toISOString(),
      };
      setLastRun(run);
      setRuns((r) => [run, ...r]);
      setRunBusy(false);
      setRunMsg(t(lang).dash.queued);
    }, 1400);
  }

  return (
    <div className="relative min-h-dvh bg-ink text-parchment">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: "url(/images/hero.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.85) brightness(0.28)",
        }}
      />
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-ink/70 via-wine/80 to-ink" />
      <Bubbles />
      <div className="grain" />

      <div className="relative z-10">
        <Header lang={lang} setLang={setLang} view={view} setView={setView} user={user} onOut={out} />

        {view === "login" && !user && (
          <Login lang={lang} onEnter={enter} onIntel={() => setView("info")} />
        )}
        {user && view === "dashboard" && (
          <Dashboard
            lang={lang}
            user={user}
            setUser={setUser}
            slots={slots}
            setSlots={setSlots}
            lastRun={lastRun}
            onRunNow={runNow}
            onRelink={() => setView("wizard")}
            runMsg={runMsg}
            runBusy={runBusy}
          />
        )}
        {user && view === "wizard" && (
          <Wizard lang={lang} user={user} setSlots={setSlots} onDone={() => setView("dashboard")} />
        )}
        {user && view === "master" && user.isOperator && (
          <Master lang={lang} operator={user.evonyName} members={members} runs={runs} />
        )}
        {view === "info" && <Info lang={lang} />}
        {user && view === "master" && !user.isOperator && (
          <Dashboard
            lang={lang}
            user={user}
            setUser={setUser}
            slots={slots}
            setSlots={setSlots}
            lastRun={lastRun}
            onRunNow={runNow}
            onRelink={() => setView("wizard")}
            runMsg={runMsg}
            runBusy={runBusy}
          />
        )}

        <Footer lang={lang} />
        <BottomNav view={view} setView={setView} user={user} lang={lang} />
      </div>
    </div>
  );
}
