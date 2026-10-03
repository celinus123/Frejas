"use client";
import Link from "next/link";
import { Icon } from "./Icon";
import { BackBar } from "./ui";
import type { LimitKind } from "@/lib/limits";

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What to say when the level someone is on has no more room for one more of something. */
export function limitCopy(kind: LimitKind, max: number): { title: string; body: string } {
  if (kind === "habits") return {
    title: `Your ${max} habits are in place`,
    body: `The free level has room for ${max} ${s(max, "habit", "habits")} of your own at a time. Archive one to make room, and bring it back whenever you like. Habits that come with a challenge don't count.`,
  };
  if (kind === "own") return {
    title: max === 1 ? "One challenge of your own at a time" : `${max} challenges of your own at a time`,
    body: `The free level has room for ${max} ${s(max, "challenge", "challenges")} that you start, solo ones and drafts included. When ${s(max, "it ends", "one ends")}, or if you delete ${s(max, "it", "one")}, you can start another. Challenges your friends start are counted separately.`,
  };
  return {
    title: `You're in ${max} ${s(max, "challenge", "challenges")} already`,
    body: `The free level has room for ${max} ${s(max, "challenge", "challenges")} that others started at a time. Leave one, or wait for one to end, and you can join this one.`,
  };
}

export function LimitCard({ kind, max, children }: { kind: LimitKind; max: number; children?: React.ReactNode }) {
  const c = limitCopy(kind, max);
  return (
    <section className="soft" role="status" style={{ padding: 20, borderRadius: 24, display: "flex", flexDirection: "column", gap: 10 }}>
      <Icon name={kind === "habits" ? "check" : "trophy"} size={26} color="var(--primary)" />
      <div className="h1" style={{ fontSize: 24 }}>{c.title}</div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>{c.body}</p>
      <p className="muted" style={{ margin: 0, fontSize: "var(--t-sub)", lineHeight: 1.45 }}>More room is coming with a paid level.</p>
      {children}
    </section>
  );
}

/** A whole page in place of a form that can't be used right now. */
export function LimitPage({ kind, max }: { kind: LimitKind; max: number }) {
  return (
    <main className="page">
      <BackBar title={kind === "habits" ? "New habit" : "New challenge"} />
      <LimitCard kind={kind} max={max} />
      {kind === "habits"
        ? <Link href="/" className="btn btn-primary">See my habits</Link>
        : <Link href="/challenges" className="btn btn-primary">Go to my challenges</Link>}
    </main>
  );
}
