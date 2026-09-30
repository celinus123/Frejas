import type { Challenge, CheckIn, Habit, HabitLog, Member } from "./types";
import { addDays, dayFraction, flexPeriod, isFlexible, iso, monthDays, parse, startOfWeek, today } from "./dates";
import { isV2, standings } from "./scoring";

export interface Who { id: string; name: string; path: string | null; you: boolean }

export type FunCard =
  | { kind: "week"; id: string; at: string; pct: number; ticks: number; best: string | null; bonus: number }
  | { kind: "month"; id: string; at: string; month: string; pct: number; ticks: number }
  | { kind: "goal"; id: string; at: string; who: Who; habit: string; target: number; monthly: boolean }
  | { kind: "friendDay"; id: string; at: string; who: Who; date: string; habits: string[] }
  | { kind: "finished"; id: string; at: string; challenge: Challenge; headline: string; sub: string; you: boolean }
  | { kind: "leading"; id: string; at: string; challenge: Challenge; who: Who; value: string };

type Log = Pick<HabitLog, "habit_id" | "log_date"> & { created_at?: string };

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00`).toISOString();

/** Your own recap cards: last week, and last month during the first ten days of a new month. */
export function recapCards(habits: Habit[], logs: Log[]): FunCard[] {
  const t = today();
  const out: FunCard[] = [];
  const done = new Set(logs.map((l) => `${l.habit_id}|${l.log_date}`));
  const avg = (from: string, to: string) => {
    const fr: number[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) { const f = dayFraction(habits, done, d); if (f !== null) fr.push(f); }
    return fr.length ? Math.round((fr.reduce((a, b) => a + b, 0) / fr.length) * 100) : null;
  };

  const lwFrom = addDays(startOfWeek(t), -7), lwTo = addDays(lwFrom, 6);
  const lwLogs = logs.filter((l) => l.log_date >= lwFrom && l.log_date <= lwTo);
  if (lwLogs.length) {
    const count = new Map<string, number>();
    for (const l of lwLogs) count.set(l.habit_id, (count.get(l.habit_id) ?? 0) + 1);
    const bestId = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    let bonus = 0;
    for (const h of habits.filter(isFlexible)) {
      const p = flexPeriod(h, lwTo);
      if (p.from !== lwFrom) continue;
      bonus += Math.max(0, (count.get(h.id) ?? 0) - p.target);
    }
    out.push({ kind: "week", id: `week-${lwFrom}`, at: at(startOfWeek(t), "07:00"), pct: avg(lwFrom, lwTo) ?? 0, ticks: lwLogs.length,
      best: habits.find((h) => h.id === bestId)?.name ?? null, bonus });
  }

  const d = parse(t);
  if (d.getDate() <= 10) {
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const days = monthDays(prev.getFullYear(), prev.getMonth());
    const mLogs = logs.filter((l) => l.log_date >= days[0] && l.log_date <= days[days.length - 1]);
    const pct = avg(days[0], days[days.length - 1]);
    if (mLogs.length && pct !== null)
      out.push({ kind: "month", id: `month-${days[0]}`, at: at(iso(new Date(d.getFullYear(), d.getMonth(), 1)), "07:30"),
        month: prev.toLocaleDateString("en-GB", { month: "long" }), pct, ticks: mLogs.length });
  }
  return out;
}

/** "Reached the weekly goal" for flexible habits (yours and friends' shared ones), this period and the one before. */
export function goalCards(habits: Habit[], logs: Log[], whoOf: (ownerId: string) => Who): FunCard[] {
  const t = today();
  const out: FunCard[] = [];
  for (const h of habits.filter(isFlexible)) {
    const seen = new Set<string>();
    for (const ref of [t, addDays(t, -7), addDays(t, -31)]) {
      const p = flexPeriod(h, ref);
      if (seen.has(p.from)) continue;
      seen.add(p.from);
      const mine = logs.filter((l) => l.habit_id === h.id && l.log_date >= p.from && l.log_date <= p.to).sort((a, b) => a.log_date.localeCompare(b.log_date));
      if (mine.length < p.target) continue;
      const hit = mine[p.target - 1];
      if (hit.log_date < addDays(t, -10)) continue;
      out.push({ kind: "goal", id: `goal-${h.id}-${p.from}`, at: hit.created_at ?? at(hit.log_date, "18:00"), who: whoOf(h.owner_id), habit: h.name,
        target: p.target, monthly: h.frequency === "monthly" });
    }
  }
  return out;
}

/** One card per friend per day with the shared habits they ticked (last 7 days). */
export function friendDayCards(habits: Habit[], logs: Log[], whoOf: (ownerId: string) => Who): FunCard[] {
  const t = today();
  const byKey = new Map<string, { owner: string; date: string; names: string[]; last: string }>();
  for (const l of logs) {
    if (l.log_date < addDays(t, -6)) continue;
    const h = habits.find((x) => x.id === l.habit_id);
    if (!h) continue;
    const k = `${h.owner_id}|${l.log_date}`;
    const g = byKey.get(k) ?? { owner: h.owner_id, date: l.log_date, names: [], last: "" };
    g.names.push(h.name);
    const ts = l.created_at ?? at(l.log_date, "18:00");
    if (ts > g.last) g.last = ts;
    byKey.set(k, g);
  }
  return [...byKey.values()].map((g) => ({ kind: "friendDay", id: `fd-${g.owner}-${g.date}`, at: g.last, who: whoOf(g.owner), date: g.date, habits: g.names }));
}

interface ChallengeData { challenge: Challenge; members: Member[]; checkins: CheckIn[] }

/** Finished in the last two weeks, and who's leading the ones still running. */
export function challengeCards(list: ChallengeData[], uid: string): FunCard[] {
  const t = today();
  const out: FunCard[] = [];
  for (const { challenge: c, members, checkins } of list) {
    if (members.length === 0) continue;
    const st = standings(c, members, checkins);
    const me = st.find((s) => s.user_id === uid);
    const who = (i: number): Who => ({ id: st[i].user_id, name: st[i].user_id === uid ? "You" : st[i].name, path: st[i].avatar_path, you: st[i].user_id === uid });

    if (c.ends_on < t && c.ends_on >= addDays(t, -14)) {
      let headline: string, sub: string;
      if (c.solo || members.length === 1) {
        headline = me?.finished ? `You finished ${c.name}!` : `${c.name} is over`;
        sub = me ? (isV2(c) ? `${me.done} of ${me.target} sessions` : `${me.done} days`) + (me.longestStreak > 1 ? ` · best run ${me.longestStreak} ${me.streakUnit}` : "") : "";
      } else if (c.win_rule === "finishers" && isV2(c)) {
        const made = st.filter((s) => s.finished);
        headline = `${c.name} is over`;
        sub = made.length ? `${made.length} of ${st.length} made it${me?.finished ? ", including you" : ""}` : "Nobody reached the goal this time";
      } else {
        headline = st[0].user_id === uid ? `You won ${c.name}!` : `${st[0].name} won ${c.name}`;
        sub = me ? `You came ${st.indexOf(me) + 1} of ${st.length} · ${me.display}` : "";
      }
      out.push({ kind: "finished", id: `fin-${c.id}`, at: at(addDays(c.ends_on, 1), "08:00"), challenge: c, headline, sub, you: !!me?.finished || st[0].user_id === uid });
    } else if (c.starts_on <= t && c.ends_on >= t && !c.solo && st.length > 1 && st[0].value > 0 && st[0].value > st[1].value
               && !(c.win_rule === "finishers" && isV2(c))) {
      const last = checkins.filter((x) => x.user_id === st[0].user_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      out.push({ kind: "leading", id: `lead-${c.id}-${st[0].user_id}`, at: last?.created_at ?? at(t, "08:00"), challenge: c, who: who(0), value: st[0].display });
    }
  }
  return out;
}
