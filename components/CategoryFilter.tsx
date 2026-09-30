"use client";
import type { Habit } from "@/lib/types";

export const MAX_CATEGORIES = 10;
export const SUGGESTED_CATEGORIES = ["Health", "Mind", "Fitness", "Home"];

/** The categories a person actually uses, in the order they first appear. */
export function categoriesOf(habits: Habit[]): string[] {
  const out: string[] = [];
  for (const h of habits) if (h.category && !out.some((c) => c.toLowerCase() === h.category!.toLowerCase())) out.push(h.category);
  return out;
}

/** A filter that isn't a real category: habits that count for a challenge. */
export const CHALLENGES = "__challenges";

export const inCategory = (h: Habit, cat: string | null, challengeHabits?: Set<string>) =>
  !cat || (cat === CHALLENGES ? !!challengeHabits?.has(h.id) : (h.category ?? "").toLowerCase() === cat.toLowerCase());

/** "All · Fitness · Mind …" — only shown when there is more than one thing to pick. */
export function CategoryFilter({ categories, value, onChange, challenges = false }:
  { categories: string[]; value: string | null; onChange: (c: string | null) => void; challenges?: boolean }) {
  if (categories.length === 0 && !challenges) return null;
  return (
    <div role="group" aria-label="Filter by category" className="no-scrollbar"
      style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -20px", padding: "2px 20px 4px" }}>
      <button className="chip" aria-pressed={value === null} onClick={() => onChange(null)}>All</button>
      {challenges && <button className="chip" aria-pressed={value === CHALLENGES} onClick={() => onChange(value === CHALLENGES ? null : CHALLENGES)}>Challenges</button>}
      {categories.map((c) => (
        <button key={c} className="chip" aria-pressed={value === c} onClick={() => onChange(value === c ? null : c)}>{c}</button>
      ))}
    </div>
  );
}
