import type { Challenge, CheckIn, Member } from "./types";
import { addDays, diffDays, formatShort, startOfWeek, today, weekday } from "./dates";

/** Unified row for leaderboards, cards and results — works for old and new challenges. */
export interface Standing {
  user_id: string;
  name: string;
  avatar_path: string | null;
  value: number;          // what the ranking sorts by
  display: string;        // how that value is shown ("81%", "16 sessions", "42 km")
  progress: number;       // 0–100 towards the whole goal (ring)
  done: number;           // sessions that count (capped per week in v2)
  target: number;         // sessions needed in total (v2) or days so far (legacy)
  consistency: number;    // 0–100 so far
  finished: boolean;      // reached finish_pct of the goal
  checkins: number;
  photos: number;
  longestStreak: number;
  currentStreak: number;  // weeks in a row (v2) or days in a row (legacy)
  streakUnit: "weeks" | "days";
  goalLabel: string;      // "3× a week", "10,000 steps / day"
}

export const isV2 = (c: Challenge) => !!c.frequency;

export function daysSoFar(c: Challenge): number {
  const end = today() < c.ends_on ? today() : c.ends_on;
  if (end < c.starts_on) return 0;
  return diffDays(end, c.starts_on) + 1;
}

/** Days left including today; 0 once it has ended. */
export const daysLeft = (c: Challenge) => (today() > c.ends_on ? 0 : diffDays(c.ends_on, today() < c.starts_on ? c.starts_on : today()) + 1);
export const totalDays = (c: Challenge) => diffDays(c.ends_on, c.starts_on) + 1;
export const weeksLeft = (c: Challenge) => Math.ceil(daysLeft(c) / 7);

// ---------------------------------------------------------------- last day to join
type HasJoinBy = { join_by?: string | null };
export const joinClosed = (c: HasJoinBy) => !!c.join_by && c.join_by < today();
/** For a label on an invitation: "Join by 5 Oct", "Last day to join", "Joining closed 5 Oct". */
export function joinByLabel(c: HasJoinBy): string | null {
  if (!c.join_by) return null;
  const n = diffDays(c.join_by, today());
  return n < 0 ? `Joining closed ${formatShort(c.join_by)}` : n === 0 ? "Last day to join" : `Join by ${formatShort(c.join_by)}`;
}
/** For a list: "3 days left to join". */
export function joinLeft(c: HasJoinBy): string | null {
  if (!c.join_by) return null;
  const n = diffDays(c.join_by, today());
  return n < 0 ? "Joining closed" : n === 0 ? "Last day to join" : `${n} ${n === 1 ? "day" : "days"} left to join`;
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "3× a week", "Mon, Wed, Fri", "Every day" (+ " · 30 min") */
export function scheduleLabel(c: Pick<Challenge, "frequency" | "days" | "times_per_week" | "min_amount" | "unit">, times?: number | null, amount?: number | null): string {
  let base = "Every day";
  if (c.frequency === "specific_days") base = [...(c.days ?? [])].sort().map((d) => DAYS[d - 1]).join(", ");
  if (c.frequency === "times_per_week") base = `${times ?? c.times_per_week ?? 1}× a week`;
  const min = amount ?? c.min_amount;
  if (min && c.unit) base += ` · ${fmt(min)} ${c.unit}`;
  return base;
}

// ---------------------------------------------------------------- v2 plan

export interface Week { from: string; to: string; target: number }

function timesFor(c: Challenge, m?: Member | null) {
  return c.same_goal ? c.times_per_week ?? 1 : m?.times_per_week ?? c.times_per_week ?? 1;
}
function thresholdFor(c: Challenge, m?: Member | null) {
  return c.same_goal ? c.min_amount : m?.goal_amount ?? c.min_amount;
}

/** The weeks of a challenge (Mon–Sun, clipped to its dates) and how many sessions each needs. */
export function planWeeks(c: Challenge, m?: Member | null): Week[] {
  const out: Week[] = [];
  for (let wk = startOfWeek(c.starts_on); wk <= c.ends_on; wk = addDays(wk, 7)) {
    const from = wk < c.starts_on ? c.starts_on : wk;
    const end = addDays(wk, 6);
    const to = end > c.ends_on ? c.ends_on : end;
    const span = diffDays(to, from) + 1;
    let target = span;
    if (c.frequency === "specific_days") {
      target = 0;
      for (let d = from; d <= to; d = addDays(d, 1)) if ((c.days ?? []).includes(weekday(d))) target++;
    } else if (c.frequency === "times_per_week") {
      target = Math.min(timesFor(c, m), span);
    }
    out.push({ from, to, target });
  }
  return out;
}

/** Days with a check-in that counts (meets the minimum amount, if there is one). */
export function qualifyingDays(c: Challenge, m: Member | null | undefined, mine: CheckIn[]): Set<string> {
  const min = thresholdFor(c, m);
  const sums = new Map<string, number>();
  for (const ci of mine) sums.set(ci.checkin_date, (sums.get(ci.checkin_date) ?? 0) + (ci.amount ?? 0));
  const out = new Set<string>();
  for (const [d, sum] of sums) if (!min || !c.unit || sum >= min) out.add(d);
  return out;
}

export interface WeekResult extends Week { done: number; extra: number; isCurrent: boolean; isPast: boolean; isFuture: boolean }

export function weekResults(c: Challenge, m: Member | null | undefined, mine: CheckIn[]): WeekResult[] {
  const days = qualifyingDays(c, m, mine);
  const t = today();
  return planWeeks(c, m).map((w) => {
    let n = 0;
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) if (days.has(d)) n++;
    return { ...w, done: Math.min(n, w.target), extra: Math.max(0, n - w.target), isCurrent: w.from <= t && t <= w.to, isPast: w.to < t, isFuture: w.from > t };
  });
}

function v2Standing(c: Challenge, m: Member, mine: CheckIn[]): Standing {
  const weeks = weekResults(c, m, mine);
  const total = weeks.reduce((a, w) => a + w.target, 0) || 1;
  const done = weeks.reduce((a, w) => a + w.done, 0);
  const past = weeks.filter((w) => w.isPast);
  const cur = weeks.find((w) => w.isCurrent);
  const denom = past.reduce((a, w) => a + w.target, 0) + (cur?.done ?? 0);
  const numer = past.reduce((a, w) => a + w.done, 0) + (cur?.done ?? 0);
  const consistency = denom ? Math.round((numer / denom) * 100) : 0;
  // weeks in a row: the current week counts once it's complete; an unfinished current week doesn't break it
  let current = 0;
  const upto = [...past, ...(cur && cur.done >= cur.target ? [cur] : [])];
  for (let i = upto.length - 1; i >= 0 && upto[i].done >= upto[i].target; i--) current++;
  let longest = 0, run = 0;
  for (const w of weeks) { if (!w.isFuture && w.done >= w.target) { run++; longest = Math.max(longest, run); } else if (w.isPast) run = 0; }
  const qual = qualifyingDays(c, m, mine);
  const totalAmount = mine.reduce((a, ci) => a + (ci.amount ?? 0), 0);
  const most = c.unit ? totalAmount : qual.size;
  const progress = Math.min(100, Math.round((done / total) * 100));
  const rule = c.win_rule ?? "consistent";
  const value = rule === "most" ? most : rule === "finishers" ? progress : consistency;
  const display = rule === "most" ? (c.unit ? `${fmt(totalAmount)} ${c.unit}` : `${qual.size} sessions`) : rule === "finishers" ? `${done}/${total}` : `${consistency}%`;
  return {
    user_id: m.user_id, name: m.profiles?.display_name || "Member", avatar_path: m.profiles?.avatar_path ?? null,
    value, display, progress, done, target: total, consistency,
    finished: done / total >= (c.finish_pct ?? 80) / 100,
    checkins: mine.length, photos: mine.filter((x) => x.photo_path).length,
    longestStreak: longest, currentStreak: current, streakUnit: "weeks",
    goalLabel: scheduleLabel(c, timesFor(c, m), thresholdFor(c, m)),
  };
}

// ---------------------------------------------------------------- legacy (v0.1 challenges)

function dayStreaks(dates: Set<string>, until: string) {
  const sorted = [...dates].sort();
  let longest = 0, run = 0, prev = "";
  for (const d of sorted) { run = prev && diffDays(d, prev) === 1 ? run + 1 : 1; longest = Math.max(longest, run); prev = d; }
  let current = 0;
  for (let cur = dates.has(until) ? until : addDays(until, -1); dates.has(cur); cur = addDays(cur, -1)) current++;
  return { longest, current };
}

function legacyStanding(c: Challenge, m: Member, mine: CheckIn[]): Standing {
  const soFar = daysSoFar(c);
  const days = new Set<string>();
  const byDay = new Map<string, number>();
  for (const ci of mine) byDay.set(ci.checkin_date, (byDay.get(ci.checkin_date) ?? 0) + (ci.amount ?? 0));
  for (const [d, sum] of byDay) if (!c.unit || c.goal_type === "shared" || !m.goal_amount || sum >= m.goal_amount) days.add(d);
  const s = dayStreaks(days, today());
  const contribution = c.unit ? mine.reduce((a, ci) => a + (ci.amount ?? 0), 0) : mine.length;
  const pct = soFar ? Math.round((days.size / soFar) * 100) : 0;
  const own = c.goal_type === "own";
  return {
    user_id: m.user_id, name: m.profiles?.display_name || "Member", avatar_path: m.profiles?.avatar_path ?? null,
    value: own ? pct : contribution, display: own ? `${pct}%` : `${fmt(contribution)} ${c.unit ?? ""}`.trim(),
    progress: own ? pct : Math.min(100, Math.round((contribution / (c.shared_target || 1)) * 100)),
    done: days.size, target: soFar, consistency: pct, finished: pct >= 80,
    checkins: mine.length, photos: mine.filter((x) => x.photo_path).length,
    longestStreak: s.longest, currentStreak: s.current, streakUnit: "days",
    goalLabel: own ? (c.unit ? `${fmt(m.goal_amount ?? 0)} ${c.unit} / day` : "Every day") : `${fmt(c.shared_target ?? 0)} ${c.unit ?? "check-ins"} together`,
  };
}

export function standings(c: Challenge, members: Member[], checkins: CheckIn[]): Standing[] {
  const rows = members.map((m) => {
    const mine = checkins.filter((ci) => ci.user_id === m.user_id);
    return isV2(c) ? v2Standing(c, m, mine) : legacyStanding(c, m, mine);
  });
  return rows.sort((a, b) => b.value - a.value || b.checkins - a.checkins);
}

export function sharedTotal(c: Challenge, checkins: CheckIn[]): number {
  return c.unit ? checkins.reduce((a, ci) => a + (ci.amount ?? 0), 0) : checkins.length;
}

export const winRuleLabel = (r: Challenge["win_rule"]) =>
  r === "finishers" ? "Everyone who makes it wins" : r === "most" ? "Most sessions wins" : "Most consistent wins";
