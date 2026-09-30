import type { Habit } from "./types";

const STOP = new Set(["the", "and", "for", "with", "my", "challenge", "every", "daily", "day", "days", "week", "weekly", "times", "min", "mins", "minutes"]);

function words(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** "Pilates body" ~ "Pilates", "Run club" ~ "Running". Deliberately loose: it only ever suggests, you decide. */
export function similar(a: string, b: string): boolean {
  const A = words(a), B = words(b);
  return A.some((x) => B.some((y) => x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)))));
}

export function bestMatch(name: string, habits: Habit[]): Habit | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return habits.find((h) => h.name.trim().toLowerCase() === n) ?? habits.find((h) => similar(name, h.name)) ?? null;
}
