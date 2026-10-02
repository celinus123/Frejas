import type { Habit } from "./types";
import { addDays, diffDays, flexPeriod, habitStart, isFlexible, isScheduledOn, parse, startOfWeek, weekday } from "./dates";

type Log = { habit_id: string; log_date: string };
const WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

export interface HabitFacts {
  longest: number; longestUnit: "days" | "weeks" | "times";
  bestWeek: { from: string; n: number } | null;
  bestMonth: { label: string; n: number } | null;
  perWeek: number; perMonth: number;
  thisWeek: number; lastWeek: number;   // this week so far, and the same days of last week
  change: number | null;                // % difference; null when last week was 0
  bonus: number;                        // sessions beyond the goal (flexible habits)
}

/** Numbers about one habit, from all its ticks. `dates` = the days it was done. */
export function habitFacts(h: Habit, dates: string[], t: string): HabitFacts {
  const done = new Set(dates);
  const start = habitStart(h);
  const first = dates.length && dates.reduce((a, d) => (d < a ? d : a)) < start ? dates.reduce((a, d) => (d < a ? d : a)) : start;

  // longest run: scheduled days in a row, or (for "times a week") weeks in a row with the goal met
  let longest = 0, run = 0;
  let longestUnit: HabitFacts["longestUnit"] = "days";
  if (!isFlexible(h)) {
    for (let d = first; d <= t; d = addDays(d, 1)) {
      if (!isScheduledOn(h, d)) continue;
      if (done.has(d)) { run++; longest = Math.max(longest, run); } else if (d < t) run = 0;
    }
  } else if (h.frequency === "times_per_week") {
    longestUnit = "weeks";
    for (let wk = startOfWeek(first); wk <= t; wk = addDays(wk, 7)) {
      const p = flexPeriod(h, wk < first ? first : wk);
      let n = 0;
      for (let d = p.from; d <= p.to; d = addDays(d, 1)) if (done.has(d)) n++;
      if (n >= p.target) { run++; longest = Math.max(longest, run); } else if (p.to < t) run = 0;
    }
  } else { longestUnit = "times"; longest = dates.length; }

  const weeks = new Map<string, number>(), months = new Map<string, number>();
  for (const d of dates) { weeks.set(startOfWeek(d), (weeks.get(startOfWeek(d)) ?? 0) + 1); months.set(d.slice(0, 7), (months.get(d.slice(0, 7)) ?? 0) + 1); }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0] ?? null;
  const bw = top(weeks), bm = top(months);

  const days = Math.max(1, diffDays(t, first) + 1);
  const wk = startOfWeek(t), span = diffDays(t, wk);
  let thisWeek = 0, lastWeek = 0;
  for (let i = 0; i <= span; i++) { if (done.has(addDays(wk, i))) thisWeek++; if (done.has(addDays(wk, i - 7))) lastWeek++; }

  let bonus = 0;
  if (isFlexible(h)) {
    const per = new Map<string, { n: number; target: number }>();
    for (const d of dates) { const p = flexPeriod(h, d); const c = per.get(p.from) ?? { n: 0, target: p.target }; c.n++; per.set(p.from, c); }
    for (const c of per.values()) bonus += Math.max(0, c.n - c.target);
  }
  return {
    longest, longestUnit,
    bestWeek: bw && bw[1] > 0 ? { from: bw[0], n: bw[1] } : null,
    bestMonth: bm && bm[1] > 0 ? { label: parse(`${bm[0]}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), n: bm[1] } : null,
    perWeek: dates.length / Math.max(1, days / 7), perMonth: dates.length / Math.max(1, days / 30.44),
    thisWeek, lastWeek, change: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null, bonus,
  };
}

export interface Insight { key: string; title: string; text: string }

/**
 * Patterns in your own ticks from the last 90 days. They are only shown when there is enough to go on:
 * a link to another habit needs at least 6 days of this habit, 4 of them together, and has to be clearly
 * more common than that other habit is on an ordinary day. Otherwise nothing is claimed.
 */
export function habitInsights(h: Habit, habits: Habit[], logs: Log[], t: string): Insight[] {
  const out: Insight[] = [];
  const from = habitStart(h) > addDays(t, -89) ? habitStart(h) : addDays(t, -89);
  const mine = new Set(logs.filter((l) => l.habit_id === h.id && l.log_date >= from && l.log_date <= t).map((l) => l.log_date));
  const n = mine.size;

  if (n >= 6) {
    let best: { score: number; other: Habit; kind: "same" | "after"; hits: number; base: number } | null = null;
    for (const o of habits) {
      if (o.id === h.id || o.archived_at) continue;
      const oFrom = habitStart(o) > from ? habitStart(o) : from;
      const span = diffDays(t, oFrom) + 1;
      if (span < 14) continue;
      const theirs = new Set(logs.filter((l) => l.habit_id === o.id && l.log_date >= addDays(oFrom, -1) && l.log_date <= t).map((l) => l.log_date));
      const base = [...theirs].filter((d) => d >= oFrom).length / span;   // how often the other habit happens on any day
      if (base <= 0) continue;
      const days = [...mine].filter((d) => d >= oFrom);
      if (days.length < 6) continue;
      for (const kind of ["same", "after"] as const) {
        const hits = days.filter((d) => theirs.has(kind === "same" ? d : addDays(d, -1))).length;
        const share = hits / days.length;
        if (hits < 4 || share < 0.6 || share / base < 1.25) continue;
        const score = share * (share / base);
        if (!best || score > best.score) best = { score, other: o, kind, hits, base };
      }
    }
    if (best) {
      const total = [...mine].filter((d) => d >= (habitStart(best!.other) > from ? habitStart(best!.other) : from)).length;
      out.push({
        key: "pair", title: `Goes together with ${best.other.name}`,
        text: best.kind === "same"
          ? `${best.hits} of the ${total} times you did ${h.name}, you ticked ${best.other.name} the same day. On an ordinary day you tick ${best.other.name} about ${Math.round(best.base * 100)}% of the time.`
          : `${best.hits} of the ${total} times you did ${h.name}, you had ticked ${best.other.name} the day before. On an ordinary day you tick ${best.other.name} about ${Math.round(best.base * 100)}% of the time.`,
      });
    }
  }

  if (!isFlexible(h)) {
    // the weekday it is most often skipped
    const miss = Array.from({ length: 7 }, () => ({ due: 0, missed: 0 }));
    for (let d = from; d < t; d = addDays(d, 1)) if (isScheduledOn(h, d)) { const w = miss[weekday(d) - 1]; w.due++; if (!mine.has(d)) w.missed++; }
    const all = miss.reduce((a, w) => ({ due: a.due + w.due, missed: a.missed + w.missed }), { due: 0, missed: 0 });
    const worst = miss.map((w, i) => ({ ...w, i })).filter((w) => w.due >= 4 && w.missed >= 3).sort((a, b) => b.missed / b.due - a.missed / a.due)[0];
    if (worst && all.due >= 14 && worst.missed / worst.due >= 0.5 && worst.missed / worst.due >= (all.missed / all.due) * 1.5)
      out.push({ key: "hard", title: `${WEEKDAYS[worst.i]} are the hard ones`, text: `You skipped it on ${worst.missed} of the last ${worst.due} ${WEEKDAYS[worst.i]}. On other days you skip it far less often.` });
  } else if (n >= 6) {
    // the weekday it most often happens
    const per = Array.from({ length: 7 }, () => 0);
    for (const d of mine) per[weekday(d) - 1]++;
    const i = per.indexOf(Math.max(...per));
    if (per[i] >= 3 && per[i] / n >= 0.35) out.push({ key: "day", title: `Mostly on ${WEEKDAYS[i]}`, text: `${per[i]} of your last ${n} times were on a ${WEEKDAYS[i].slice(0, -1)}.` });
  }
  return out;
}

export interface HabitRate { habit: Habit; done: number; due: number; rate: number; label: string }

/** How each habit is going in a period: done out of what was planned. A week that isn't over yet only counts if it is the only one. */
export function habitRates(habits: Habit[], logs: Log[], from: string, to: string, t: string): HabitRate[] {
  const end = to < t ? to : t;
  const out: HabitRate[] = [];
  for (const h of habits) {
    if (h.archived_at) continue;
    const dates = new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.log_date));
    let done = 0, due = 0, label = "";
    if (!isFlexible(h)) {
      for (let d = from; d <= end; d = addDays(d, 1)) if (isScheduledOn(h, d)) { due++; if (dates.has(d)) done++; }
      label = `${done} of ${due} days`;
    } else {
      const seen = new Set<string>();
      const periods: { n: number; target: number; open: boolean }[] = [];
      for (let d = habitStart(h) > from ? habitStart(h) : from; d <= end; d = addDays(d, 1)) {
        const p = flexPeriod(h, d);
        if (seen.has(p.from)) continue;
        seen.add(p.from);
        let n = 0;
        for (let x = p.from; x <= p.to; x = addDays(x, 1)) if (dates.has(x)) n++;
        periods.push({ n: Math.min(n, p.target), target: p.target, open: p.to > t });
      }
      const closed = periods.filter((p) => !p.open);
      const use = closed.length ? closed : periods;
      done = use.reduce((a, p) => a + p.n, 0); due = use.reduce((a, p) => a + p.target, 0);
      label = `${done} of ${due} ${due === 1 ? "session" : "sessions"}`;
    }
    if (due > 0) out.push({ habit: h, done, due, rate: done / due, label });
  }
  return out;
}
