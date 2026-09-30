import type { Habit } from "./types";

// All dates are local calendar dates as "YYYY-MM-DD" strings.
export function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => iso(new Date());

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000);
}

/** 1 = Monday … 7 = Sunday */
export function weekday(s: string): number {
  const w = parse(s).getDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(s: string): string {
  return addDays(s, 1 - weekday(s));
}

export function monthDays(year: number, month: number): string[] {
  const out: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const dayShort = (n: number) => DAY[n - 1];

export function formatLong(s: string): string {
  return parse(s).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function formatShort(s: string): string {
  return parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function timeAgo(ts: string): string {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ---------------------------------------------------------------- habits

/** Habits with fixed days count toward the daily circle. */
export function isFlexible(h: Habit): boolean {
  return h.frequency === "times_per_week" || h.frequency === "every_other_week" || h.frequency === "monthly";
}

/** First day a habit is active (a future challenge's habit waits until it starts). */
export const habitStart = (h: Habit) => (h.starts_on && h.starts_on > h.created_at.slice(0, 10) ? h.starts_on : h.created_at.slice(0, 10));

export function isScheduledOn(h: Habit, date: string): boolean {
  if (isFlexible(h)) return false;
  if (date < habitStart(h)) return false;
  if (h.frequency === "daily") return true;
  return (h.days ?? []).includes(weekday(date));
}

export function frequencyLabel(h: Pick<Habit, "frequency" | "days" | "times_per_week">): string {
  switch (h.frequency) {
    case "daily":
      return "Daily";
    case "specific_days": {
      const d = [...(h.days ?? [])].sort();
      if (d.join() === "1,2,3,4,5") return "Weekdays";
      if (d.join() === "6,7") return "Weekends";
      if (d.length === 1) return `${dayShort(d[0])}s`;
      return d.map(dayShort).join(", ");
    }
    case "times_per_week":
      return `${h.times_per_week ?? 1}× / week`;
    case "every_other_week":
      return "Every other week";
    case "monthly":
      return "Monthly";
  }
}

/** For flexible habits: the current period and how many are needed in it. */
export function flexPeriod(h: Habit, date: string): { from: string; to: string; target: number; label: string } {
  if (h.frequency === "monthly") {
    const d = parse(date);
    const days = monthDays(d.getFullYear(), d.getMonth());
    return { from: days[0], to: days[days.length - 1], target: 1, label: "This month" };
  }
  const wk = startOfWeek(date);
  if (h.frequency === "every_other_week") {
    const base = startOfWeek(habitStart(h));
    const weeks = Math.floor(diffDays(wk, base) / 7);
    const from = weeks % 2 === 0 ? wk : addDays(wk, -7);
    return { from, to: addDays(from, 13), target: 1, label: "These two weeks" };
  }
  // the first week of a habit that starts mid-week only asks for what fits
  const start = habitStart(h);
  const from = start > wk ? start : wk;
  const to = addDays(wk, 6);
  const span = Math.max(1, diffDays(to, from) + 1);
  return { from, to, target: Math.min(h.times_per_week ?? 1, span), label: "This week" };
}

/** Share of scheduled (non-flexible) habits done on a date. null = nothing scheduled. */
export function dayFraction(habits: Habit[], done: Set<string>, date: string): number | null {
  const sched = habits.filter((h) => !h.archived_at && isScheduledOn(h, date));
  if (!sched.length) return null;
  return sched.filter((h) => done.has(`${h.id}|${date}`)).length / sched.length;
}

/** Extra sessions beyond the goal of flexible habits ("3× a week" done 4 times = 1 bonus), for periods starting in [from, to]. */
export function bonusSessions(habits: Habit[], logs: { habit_id: string; log_date: string }[], from: string, to: string): number {
  let bonus = 0;
  for (const h of habits) {
    if (!isFlexible(h)) continue;
    const counts = new Map<string, { n: number; target: number }>();
    for (const l of logs) {
      if (l.habit_id !== h.id) continue;
      const p = flexPeriod(h, l.log_date);
      if (p.from < from || p.from > to) continue;
      const c = counts.get(p.from) ?? { n: 0, target: p.target };
      c.n++; counts.set(p.from, c);
    }
    for (const c of counts.values()) bonus += Math.max(0, c.n - c.target);
  }
  return bonus;
}
