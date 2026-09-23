import { Crown } from "lucide-react";
import { Badge, Ornate } from "../components/ui";
import type { Lang, Member, Run } from "../lib/types";
import { t } from "../lib/i18n";

function statusTone(s: string): "ok" | "warn" | "bad" | "gold" {
  if (s === "ok") return "ok";
  if (s === "queued") return "warn";
  if (s === "failed" || s === "needs_code") return "bad";
  return "gold";
}

export default function Master({
  lang,
  operator,
  members,
  runs,
}: {
  lang: Lang;
  operator: string;
  members: Member[];
  runs: Run[];
}) {
  const d = t(lang);
  const m = d.master;
  const days = d.days;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="relative mb-6 overflow-hidden rounded-[22px] border border-gold/40">
        <img src="/images/banner.jpg" alt="" className="h-36 w-full object-cover sm:h-48" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-pink-hot">Operator</p>
            <h1 className="font-display text-3xl font-black title-gold sm:text-4xl">{m.title}</h1>
            <p className="mt-1 max-w-xl text-sm text-parchment/80">{m.intro}</p>
          </div>
          <Badge tone="gold">
            <Crown className="h-3 w-3" /> {operator}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Ornate className="lg:col-span-2" pad={false}>
          <div className="border-b border-gold/20 px-4 py-3">
            <h3 className="font-display text-lg text-gold-bright">{m.slots}</h3>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-gold/70">
                <tr>
                  <th className="px-4 py-2">{m.player}</th>
                  <th>{m.day}</th>
                  <th>{m.time}</th>
                  <th>{m.active}</th>
                </tr>
              </thead>
              <tbody>
                {members.flatMap((mem) =>
                  mem.slots.map((s) => (
                    <tr key={s.id} className="border-t border-gold/10">
                      <td className="px-4 py-2.5 font-bold text-parchment">{mem.evonyName}</td>
                      <td className="text-gold">{days[s.weekday - 1]}</td>
                      <td className="font-mono text-cyan-bubble">{s.time}</td>
                      <td>
                        <Badge tone={s.active ? "ok" : "gold"}>{s.active ? "yes" : "no"}</Badge>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Ornate>

        <Ornate className="lg:col-span-3" pad={false}>
          <div className="border-b border-gold/20 px-4 py-3">
            <h3 className="font-display text-lg text-gold-bright">{m.runs}</h3>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-gold/70">
                <tr>
                  <th className="px-4 py-2">{m.player}</th>
                  <th>{m.kind}</th>
                  <th>{m.status}</th>
                  <th>{m.hrs}</th>
                  <th>{m.created}</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-parchment/50">
                      {m.empty}
                    </td>
                  </tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-gold/10">
                    <td className="px-4 py-2.5 font-bold">{r.player}</td>
                    <td className="text-parchment/70">{r.kind}</td>
                    <td>
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="font-mono text-cyan-bubble">{r.shieldHoursRemaining ?? "—"}</td>
                    <td className="text-parchment/50">{r.createdAt.slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Ornate>
      </div>
    </div>
  );
}
