"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Flame, Icon } from "@/components/Icon";
import { Ring } from "@/components/Ring";
import { BackBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { addDays, frequencyLabel, isFlexible, isScheduledOn, monthDays, parse, today, weekday } from "@/lib/dates";
import { logHabit, unlogHabit } from "@/lib/data";
import type { Habit, HabitLog } from "@/lib/types";

export default function HabitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { userId } = useApp();
  const [habit, setHabit] = useState<Habit | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [linked, setLinked] = useState<{ id: string; name: string }[]>([]);
  const t = today();

  const load = useCallback(async () => {
    const [h, l, m] = await Promise.all([
      supabase().from("habits").select("*").eq("id", id).single(),
      supabase().from("habit_logs").select("*").eq("habit_id", id).order("log_date"),
      supabase().from("challenge_members").select("challenges(id, name)").eq("habit_id", id),
    ]);
    setHabit(h.data as Habit);
    setLogs((l.data ?? []) as HabitLog[]);
    setLinked(((m.data ?? []) as unknown as { challenges: { id: string; name: string } | null }[]).flatMap((r) => (r.challenges ? [r.challenges] : [])));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const done = useMemo(() => new Set(logs.map((l) => l.log_date)), [logs]);
  if (!habit) return <main className="page"><div className="skeleton" style={{ height: 400 }} /></main>;

  const days = monthDays(month.y, month.m);
  const flexible = isFlexible(habit);
  const due = (d: string) => (flexible ? d <= t && d >= habit.created_at.slice(0, 10) : isScheduledOn(habit, d) && d <= t);
  const dueDays = days.filter(due);
  const monthDone = days.filter((d) => done.has(d)).length;
  const pct = flexible ? null : dueDays.length ? Math.round((dueDays.filter((d) => done.has(d)).length / dueDays.length) * 100) : 0;

  // streak counts scheduled days in a row (unscheduled days don't break it)
  let streak = 0;
  if (!flexible) {
    let d = done.has(t) || !isScheduledOn(habit, t) ? t : addDays(t, -1);
    for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
      if (d < habit.created_at.slice(0, 10)) break;
      if (!isScheduledOn(habit, d)) continue;
      if (done.has(d)) streak++; else break;
    }
  }

  async function toggleDay(d: string) {
    if (!userId || d > t) return;
    const ex = logs.find((l) => l.log_date === d);
    if (ex) { setLogs((ls) => ls.filter((l) => l.id !== ex.id)); await unlogHabit(ex.id); }
    else { const l = await logHabit(habit!.id, userId, d); setLogs((ls) => [...ls, l]); }
  }

  const lead = weekday(days[0]) - 1;
  const monthName = parse(days[0]).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <main className="page">
      <BackBar right={<Link className="icon-btn" aria-label="Edit habit" href={`/habits/${habit.id}/edit`}><Icon name="edit" /></Link>} />
      <div>
        <h1 className="h1">{habit.name}</h1>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <span className="tag">{frequencyLabel(habit)}</span>
          {habit.category && <span className="tag">{habit.category}</span>}
          <span className="tag" style={{ display: "flex", gap: 4, alignItems: "center", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <Icon name={habit.visibility === "friends" ? "users" : "lock"} size={13} />{habit.visibility === "friends" ? "Friends" : "Private"}
          </span>
          {habit.archived_at && <span className="tag">Archived</span>}
        </div>
      </div>

      <section className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
        {pct !== null ? (
          <Ring size={84} stroke={9} pct={pct}><span style={{ fontSize: 19, fontWeight: 800 }}>{pct}%</span><span className="muted" style={{ fontSize: 10.5 }}>this month</span></Ring>
        ) : (
          <Ring size={84} stroke={9} pct={100 * Math.min(1, monthDone / 4)}><span style={{ fontSize: 19, fontWeight: 800 }}>{monthDone}</span><span className="muted" style={{ fontSize: 10.5 }}>this month</span></Ring>
        )}
        <div style={{ flex: 1, display: "flex", gap: 8 }}>
          {!flexible && <div style={{ flex: 1 }}><div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 18, fontWeight: 800 }}><Flame size={17} />{streak}</div><div className="muted" style={{ fontSize: 12 }}>streak</div></div>}
          <div style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 800 }}>{logs.length}</div><div className="muted" style={{ fontSize: 12 }}>times in total</div></div>
        </div>
      </section>

      <section className="card" style={{ padding: "14px 12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
          <div className="font-display" style={{ fontSize: 17, fontWeight: 600 }}>{monthName}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Previous month" onClick={() => shift(-1)}><Icon name="left" size={16} /></button>
            <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Next month" onClick={() => shift(1)}><Icon name="right" size={16} /></button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: 7, justifyItems: "center" }}>
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <div key={d} className="muted" style={{ fontSize: 11, fontWeight: 800 }}>{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
          {days.map((d) => {
            const on = done.has(d), future = d > t;
            return (
              <button key={d} disabled={future} onClick={() => toggleDay(d)} aria-label={`${parse(d).getDate()}${on ? ", done" : ""}`}
                style={{ width: 36, height: 36, borderRadius: "50%", border: 0, fontSize: 13, fontWeight: on ? 800 : 700, background: on ? "var(--primary)" : d === t ? "var(--soft-l)" : "transparent", color: on ? "var(--on-primary)" : future ? "var(--ink-2)" : "var(--ink)" }}>
                {parse(d).getDate()}
              </button>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12, padding: "0 4px" }}>Tap a past day to fill it in.</div>
      </section>

      {linked.length > 0 && (
        <section className="card group">
          {linked.map((c) => (
            <Link key={c.id} href={`/challenges/${c.id}`} className="row" style={{ color: "inherit", textDecoration: "none" }}>
              <Icon name="trophy" color="var(--primary)" />
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Counts toward</div><div className="muted" style={{ fontSize: 12.5 }}>{c.name}</div></div>
              <Icon name="right" size={16} color="var(--ink-2)" />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
