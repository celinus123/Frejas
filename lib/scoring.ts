import type { Challenge, CheckIn, Member } from "./types";
import { addDays, diffDays, today } from "./dates";

export interface Standing {
  user_id: string;
  name: string;
  avatar_path: string | null;
  goal: number | null;
  value: number;      // % of goal (own) or contribution (shared)
  daysAtGoal: number;
  daysSoFar: number;
  checkins: number;
  photos: number;
  longestStreak: number;
  currentStreak: number;
}

export function daysSoFar(c: Challenge): number {
  const end = today() < c.ends_on ? today() : c.ends_on;
  if (end < c.starts_on) return 0;
  return diffDays(end, c.starts_on) + 1;
}

/** Days left including today; 0 once it has ended. */
export const daysLeft = (c: Challenge) => (today() > c.ends_on ? 0 : diffDays(c.ends_on, today() < c.starts_on ? c.starts_on : today()) + 1);
export const totalDays = (c: Challenge) => diffDays(c.ends_on, c.starts_on) + 1;

function streaks(dates: Set<string>, until: string): { longest: number; current: number } {
  const sorted = [...dates].sort();
  let longest = 0, run = 0, prev = "";
  for (const d of sorted) {
    run = prev && diffDays(d, prev) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  let cursor = dates.has(until) ? until : addDays(until, -1);
  while (dates.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  return { longest, current };
}

/** Which days count as "at goal" for a member. */
function goalDays(c: Challenge, m: Member, mine: CheckIn[]): Set<string> {
  const byDay = new Map<string, number>();
  for (const ci of mine) byDay.set(ci.checkin_date, (byDay.get(ci.checkin_date) ?? 0) + (ci.amount ?? 0));
  const out = new Set<string>();
  for (const [day, sum] of byDay) {
    if (!c.unit || c.goal_type === "shared" || !m.goal_amount || sum >= m.goal_amount) out.add(day);
  }
  return out;
}

export function standings(c: Challenge, members: Member[], checkins: CheckIn[]): Standing[] {
  const soFar = daysSoFar(c);
  const rows = members.map((m) => {
    const mine = checkins.filter((ci) => ci.user_id === m.user_id);
    const days = goalDays(c, m, mine);
    const s = streaks(days, today());
    const contribution = c.unit ? mine.reduce((a, ci) => a + (ci.amount ?? 0), 0) : mine.length;
    return {
      user_id: m.user_id,
      name: m.profiles?.display_name || "Member",
      avatar_path: m.profiles?.avatar_path ?? null,
      goal: m.goal_amount,
      value: c.goal_type === "own" ? (soFar ? Math.round((days.size / soFar) * 100) : 0) : contribution,
      daysAtGoal: days.size,
      daysSoFar: soFar,
      checkins: mine.length,
      photos: mine.filter((ci) => ci.photo_path).length,
      longestStreak: s.longest,
      currentStreak: s.current,
    };
  });
  return rows.sort((a, b) => b.value - a.value || b.checkins - a.checkins);
}

export function sharedTotal(c: Challenge, checkins: CheckIn[]): number {
  return c.unit ? checkins.reduce((a, ci) => a + (ci.amount ?? 0), 0) : checkins.length;
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
