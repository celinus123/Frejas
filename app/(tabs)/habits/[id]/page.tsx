"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Flame, Icon } from "@/components/Icon";
import { Ring } from "@/components/Ring";
import { BackBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { addDays, formatShort, frequencyLabel, habitStart, isFlexible, isScheduledOn, monthDays, parse, startOfWeek, today, weekday } from "@/lib/dates";
import { loadHabits, loadLogs, logHabit, unlogHabit, unlogHabitOn } from "@/lib/data";
import { habitFacts, habitInsights } from "@/lib/insights";
import type { Habit, HabitLog } from "@/lib/types";

export default function HabitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { userId } = useApp();
  const [habit, setHabit] = useState<Habit | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [linked, setLinked] = useState<{ id: string; name: string }[]>([]);
  const [view, setView] = useState<"Week" | "Month">("Month");
  const [week, setWeek] = useState(() => startOfWeek(today()));
  const [mine, setMine] = useState<{ habits: Habit[]; logs: HabitLog[] }>({ habits: [], logs: [] });   // your other habits, to look for patterns
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
  useEffect(() => {
    if (!userId) return;
    Promise.all([loadHabits(userId), loadLogs(userId, addDays(t, -91), t)]).then(([habits, l]) => setMine({ habits, logs: l })).catch(() => {});
  }, [userId, t]);

  const done = useMemo(() => new Set(logs.map((l) => l.log_date)), [logs]);
  if (!habit) return <main className="page"><div className="skeleton" style={{ height: 400 }} /></main>;

  const days = monthDays(month.y, month.m);
  const flexible = isFlexible(habit);
  const due = (d: string) => (flexible ? d <= t && d >= habitStart(habit) : isScheduledOn(habit, d) && d <= t);
  const dueDays = days.filter(due);
  const monthDone = days.filter((d) => done.has(d)).length;
  const pct = flexible ? null : dueDays.length ? Math.round((dueDays.filter((d) => done.has(d)).length / dueDays.length) * 100) : 0;

  // streak counts scheduled days in a row (unscheduled days don't break it)
  let streak = 0;
  if (!flexible) {
    let d = done.has(t) || !isScheduledOn(habit, t) ? t : addDays(t, -1);
    for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
      if (d < habitStart(habit)) break;
      if (!isScheduledOn(habit, d)) continue;
      if (done.has(d)) streak++; else break;
    }
  }

  async function toggleDay(d: string) {
    if (!userId || d > t) return;
    const ex = logs.find((l) => l.log_date === d);
    const twin = habit!.linked_habit_id;   // its pair is ticked and unticked with it
    if (ex) { setLogs((ls) => ls.filter((l) => l.id !== ex.id)); await unlogHabit(ex.id); if (twin) await unlogHabitOn(twin, d); }
    else { const l = await logHabit(habit!.id, userId, d); setLogs((ls) => [...ls, l]); if (twin) await logHabit(twin, userId, d).catch(() => {}); }
  }

  const facts = habitFacts(habit, logs.map((l) => l.log_date), t);
  // this habit's ticks come from the full list above (so a tick you just made counts straight away)
  const insights = habit.owner_id === userId ? habitInsights(habit, mine.habits, [...mine.logs.filter((l) => l.habit_id !== habit.id), ...logs], t) : [];
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const weekDone = weekDays.filter((d) => done.has(d)).length;
  const cell = (v: React.ReactNode, l: string) => <div><div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>{v}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{l}</div></div>;
  const vs = facts.change === null ? (facts.thisWeek > 0 ? `+${facts.thisWeek}` : null) : `${facts.change > 0 ? "+" : ""}${facts.change}%`;
  const row = (label: string, value: React.ReactNode) => <div className="row"><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>{label}</div><span style={{ fontSize: 14, fontWeight: 800 }}>{value}</span></div>;
  const one = (n: number) => (Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : n.toFixed(1));
  const lead = weekday(days[0]) - 1;
  const monthName = parse(days[0]).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
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
          <span className="tag">Since {formatShort(habitStart(habit))}</span>
          {habit.linked_habit_id && mine.habits.find((h) => h.id === habit.linked_habit_id) && (
            <Link href={`/habits/${habit.linked_habit_id}`} className="tag" style={{ display: "flex", gap: 4, alignItems: "center", color: "inherit", textDecoration: "none", background: "var(--accent-bg)" }}>
              <Icon name="link" size={13} />Ticked with {mine.habits.find((h) => h.id === habit.linked_habit_id)!.name}
            </Link>
          )}
          {habit.archived_at && <span className="tag">Archived</span>}
        </div>
      </div>

      <section className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
        {pct !== null ? (
          <Ring size={84} stroke={9} pct={pct}><span className="ring-num" style={{ fontSize: 19 }}>{pct}%</span><span className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>this month</span></Ring>
        ) : (
          <Ring size={84} stroke={9} pct={100 * Math.min(1, monthDone / 4)}><span className="ring-num" style={{ fontSize: 19 }}>{monthDone}</span><span className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>this month</span></Ring>
        )}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 10, rowGap: 12 }}>
          {!flexible && cell(<><Flame size={17} />{streak}</>, streak === 1 ? "day in a row" : "days in a row")}
          {cell(logs.length, "times in total")}
          {cell(facts.thisWeek, "this week")}
          {vs && cell(<span style={{ color: facts.change !== null && facts.change < 0 ? "var(--ink-2)" : undefined }}>{vs}</span>, facts.change === null ? "new this week" : "vs last week")}
          {flexible && facts.bonus > 0 && cell(`+${facts.bonus}`, facts.bonus === 1 ? "bonus session" : "bonus sessions")}
        </div>
      </section>

      <section className="card" style={{ padding: "14px 12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
          <div className="font-display" style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {view === "Month" ? monthName : week === startOfWeek(t) ? "This week" : `${formatShort(week)} – ${formatShort(addDays(week, 6))}`}
          </div>
          <div className="seg" style={{ padding: 3 }}>
            {(["Week", "Month"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} style={{ height: 28, flex: "none", padding: "0 11px", fontSize: 12 }}>{v}</button>)}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label={view === "Month" ? "Previous month" : "Previous week"} onClick={() => (view === "Month" ? shift(-1) : setWeek(addDays(week, -7)))}><Icon name="left" size={16} /></button>
            <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label={view === "Month" ? "Next month" : "Next week"} disabled={view === "Week" && week >= startOfWeek(t)}
              onClick={() => (view === "Month" ? shift(1) : setWeek(addDays(week, 7)))}><Icon name="right" size={16} /></button>
          </div>
        </div>
        {view === "Month" ? (
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
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px 0" }}>
              {weekDays.map((d) => {
                const on = done.has(d), future = d > t, off = !flexible && !isScheduledOn(habit, d);
                return (
                  <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span className="muted" style={{ fontSize: 11, fontWeight: 800 }}>{parse(d).toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2)}</span>
                    <button disabled={future} onClick={() => toggleDay(d)} aria-label={`${formatShort(d)}${on ? ", done" : ""}`}
                      style={{ width: 40, height: 40, padding: 0, borderRadius: "50%", fontSize: 13, fontWeight: on ? 800 : 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
                        border: on ? 0 : `2px ${off || future ? "dotted" : "solid"} var(--soft)`, background: on ? "var(--primary)" : d === t ? "var(--soft-l)" : "transparent", color: on ? "var(--on-primary)" : future ? "var(--ink-2)" : "var(--ink)" }}>
                      {on ? <Icon name="check" size={17} stroke={2.6} /> : parse(d).getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}><b style={{ color: "var(--ink)" }}>{weekDone} {weekDone === 1 ? "time" : "times"}</b> this week{habit.frequency === "times_per_week" ? ` · goal ${habit.times_per_week}` : ""}</div>
          </>
        )}
        <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>Tap a past day to fill it in.</div>
      </section>

      {logs.length > 0 && (
        <>
          <h2 className="h2" style={{ marginTop: 6 }}>Highlights</h2>
          <section className="card group">
            {facts.longestUnit !== "times" && row(facts.longestUnit === "weeks" ? "Longest run of full weeks" : "Longest streak", <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Flame size={16} />{facts.longest} {facts.longestUnit === "weeks" ? (facts.longest === 1 ? "week" : "weeks") : facts.longest === 1 ? "day" : "days"}</span>)}
            {facts.bestWeek && row("Best week", `${facts.bestWeek.n} ${facts.bestWeek.n === 1 ? "time" : "times"} · ${formatShort(facts.bestWeek.from)}`)}
            {facts.bestMonth && row("Best month", `${facts.bestMonth.n} ${facts.bestMonth.n === 1 ? "time" : "times"} · ${facts.bestMonth.label}`)}
            {row("Average per week", one(facts.perWeek))}
            {row("Average per month", one(facts.perMonth))}
          </section>
        </>
      )}

      {insights.length > 0 && (
        <>
          <h2 className="h2" style={{ marginTop: 6 }}>Patterns</h2>
          {insights.map((x) => (
            <section key={x.key} className="soft" style={{ padding: "14px 16px", borderRadius: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ width: 38, height: 38, borderRadius: 13, background: "var(--surface)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={x.key === "pair" ? "link" : "calendar"} size={19} /></span>
              <div><div className="t-title">{x.title}</div><div className="t-text muted" style={{ marginTop: 2, lineHeight: 1.45 }}>{x.text}</div></div>
            </section>
          ))}
          <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>From your own ticks over the last 90 days. A pattern, not a rule.</div>
        </>
      )}

      {linked.length > 0 && (
        <section className="card group">
          {linked.map((c) => (
            <Link key={c.id} href={`/challenges/${c.id}`} className="row" style={{ color: "inherit", textDecoration: "none" }}>
              <Icon name="trophy" color="var(--primary)" />
              <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Counts toward</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{c.name}</div></div>
              <Icon name="right" size={16} color="var(--ink-2)" />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
