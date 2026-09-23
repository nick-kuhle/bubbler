export type Lang = "en" | "es";
export type View = "login" | "dashboard" | "wizard" | "master" | "info";

export type User = {
  email: string;
  evonyName: string;
  isOperator: boolean;
};

export type Slot = {
  id: string;
  weekday: number;
  time: string;
  shieldHours: number;
  active: boolean;
};

export type Run = {
  id: string;
  player: string;
  kind: "scheduled" | "manual";
  status: "ok" | "failed" | "queued" | "needs_code";
  shieldHoursRemaining: number | null;
  createdAt: string;
};

export type Member = {
  evonyName: string;
  slots: Slot[];
  lastRun: Run | null;
};
