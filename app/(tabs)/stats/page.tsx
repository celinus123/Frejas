"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Flame, Icon } from "@/components/Icon";
import { DayCircle, Ring } from "@/components/Ring";
import { Sheet } from "@/components/ui";
import { CategoryFilter, categoriesOf, inCategory } from "@/components/CategoryFilter";
import { addDays, bonusSessions, dayFraction, iso, flexPeriod, formatLong, frequencyLabel, habitStart, isFlexible, isScheduledOn, monthDays, parse, startOfWeek, today, weekday } from "@/lib/dates";
import { loadHabits, loadLogs, logHabit, unlogHabit } from "@/lib/data";
import type { Habit, HabitLog } from "@/lib/types";

type Period = "Week" | "Month" | "Year";

export default function Stats() {
  const { userId } = useApp();
  const t = today();
  const [period, setPeriod] = useState<Period>("Month");
  const [anchor, setAnchor] = useState(t);
  const [allHabits, setHabits] = useState<Habit[] | null>(null);
  const [allLogs, setLogs] = useState<HabitLog[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const y = parse(anchor).getFullYear();
    const [h, l] = await Promise.all([loadHabits(userId, true), loadLogs(userId, `${y - 1}-12-01`, `${y}-12-31`)]);
    setHabits(h.filter((x) => !x.archived_at)); setLogs(l);
  }, [userId, anchor]);
  useEffect(() => { load(); }, [load]);

  const done = useMemo(() => new Set(allLogs.map((l) => `${l.habit_id}|${l.log_date}`)), [allLogs]);
  if (!allHabits) return <main className="page"><div className="skeleton" style={{ height: 160 }} /><div className="skeleton" style={{ height: 320 }} /></main>;

  const cats = categoriesOf(allHabits);
  const habits = allHabits.filter((h) => inCategory(h, cat));
  const ids = new Set(habits.map((h) => h.id));
  const logs = cat ? allLogs.filter((l) => ids.has(l.habit_id)) : allLogs;
  const range = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
  const a = parse(anchor);
  let from: string, to: string, title: string;
  if (period === "Week") { from = startOfWeek(anchor); to = addDays(from, 6); title = `${parse(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parse(to).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`; }
  else if (period === "Month") { const ds = monthDays(a.getFullYear(), a.getMonth()); from = ds[0]; to = ds[ds.length - 1]; title = a.toLocaleDateString("en-GB", { month: "long", year: "numeric" }); }
  else { from = `${a.getFullYear()}-01-01`; to = `${a.getFullYear()}-12-31`; title = String(a.getFullYear()); }

  const past = range(from, to < t ? to : t);
  const fracs = past.map((d) => dayFraction(habits, done, d)).filter((f): f is number => f !== null);
  const pct = fracs.length ? Math.round((fracs.reduce((x, y) => x + y, 0) / fracs.length) * 100) : 0;
  const count = logs.filter((l) => l.log_date >= from && l.log_date <= to).length;
  const weeks = Math.max(1, past.length / 7);

  // streak: consecutive days (back from today) with at least one habit done
  const anyDone = new Set(logs.map((l) => l.log_date));
  let streak = 0;
  for (let d = anyDone.has(t) ? t : addDays(t, -1); anyDone.has(d); d = addDays(d, -1)) streak++;

  function shift(n: number) {
    const d = parse(anchor);
    if (period === "Week") setAnchor(addDays(anchor, 7 * n));
    else if (period === "Month") setAnchor(iso(new Date(d.getFullYear(), d.getMonth() + n, 1)));
    else setAnchor(`${d.getFullYear() + n}-01-01`);
  }

  async function toggle(h: Habit, d: string) {
    if (!userId) return;
    const ex = logs.find((l) => l.habit_id === h.id && l.log_date === d);
    if (ex) { setLogs((ls) => ls.filter((l) => l.id !== ex.id)); await unlogHabit(ex.id); }
    else { const l = await logHabit(h.id, userId, d); setLogs((ls) => [...ls, l]); }
  }

  const tile = (bg: string, icon: React.ReactNode) => <div style={{ width: 38, height: 38, borderRadius: 14, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>;
  const stat = (icon: React.ReactNode, v: React.ReactNode, l: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{icon}<div><div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div></div>
  );
  const flexible = habits.filter((h) => isFlexible(h) && habitStart(h) <= t);
  const scheduledHabits = habits.filter((h) => !isFlexible(h));
  const weekDays = period === "Week" ? range(from, to) : [];

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="h1">Stats</h1>
        <div className="seg" style={{ padding: 3 }}>
          {(["Week", "Month", "Year"] as Period[]).map((p) => (
            <button key={p} aria-pressed={period === p} onClick={() => { setPeriod(p); setAnchor(t); }} style={{ height: 32, flex: "none", padding: "0 12px" }}>{p}</button>
          ))}
        </div>
      </div>

      <CategoryFilter categories={cats} value={cat} onChange={setCat} />

      <section className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 20 }}>
        <Ring size={108} stroke={11} pct={pct}>
          <span className="font-display" style={{ fontSize: 27, fontWeight: 600 }}>{pct}%</span><span className="muted" style={{ fontSize: 11.5 }}>of goal</span>
        </Ring>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stat(tile("var(--accent-bg)", <Flame size={20} />), streak, "day streak")}
          {stat(tile("var(--soft)", <Icon name="check" color="var(--primary)" stroke={2.2} />), count, "check-ins")}
          {stat(tile("var(--soft)", <Icon name="stats" color="var(--primary)" />), period === "Week" ? (count / Math.max(1, past.length)).toFixed(1) : (count / weeks).toFixed(1), period === "Week" ? "per day" : "per week")}
          {habits.some(isFlexible) && stat(tile("var(--accent-bg)", <Icon name="plus" color="var(--accent)" stroke={2.4} />), bonusSessions(habits, logs, from, to), "bonus sessions")}
        </div>
      </section>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Previous" onClick={() => shift(-1)}><Icon name="left" size={16} /></button>
        <span className="font-display" style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
        <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Next" onClick={() => shift(1)} disabled={to >= t}><Icon name="right" size={16} /></button>
      </div>

      {period === "Month" && (
        <section className="card" style={{ padding: "14px 12px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: 7, justifyItems: "center" }}>
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <div key={d} className="muted" style={{ fontSize: 11, fontWeight: 800 }}>{d}</div>)}
            {Array.from({ length: weekday(from) - 1 }, (_, i) => <div key={`x${i}`} />)}
            {range(from, to).map((d) => (
              <DayCircle key={d} day={parse(d).getDate()} fraction={dayFraction(habits, done, d)} today={d === t} future={d > t} onClick={() => setDaySheet(d)} />
            ))}
          </div>
        </section>
      )}

      {period === "Week" && (
        <section className="card" style={{ padding: "12px 16px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 6 }}>{weekDays.map((d) => <div key={d} style={{ width: 26, textAlign: "center", fontSize: 11, fontWeight: 800, color: d === t ? "var(--primary)" : "var(--ink-2)" }}>{parse(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</div>)}</div>
          </div>
          {scheduledHabits.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--soft)" }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {weekDays.map((d) => {
                  const sch = isScheduledOn(h, d), on = done.has(`${h.id}|${d}`), fut = d > t;
                  if (!sch) return <div key={d} style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 6, height: 2, background: "var(--soft)" }} /></div>;
                  return (
                    <button key={d} disabled={fut} onClick={() => toggle(h, d)} aria-label={`${h.name} ${formatLong(d)}${on ? ", done" : ""}`}
                      style={{ width: 26, height: 26, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--primary)" : d === t ? "var(--soft-l)" : "none", color: "var(--on-primary)", border: on ? 0 : `2px ${fut ? "dotted" : "solid"} var(--soft)` }}>
                      {on && <Icon name="check" size={13} stroke={2.8} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="muted" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, padding: "10px 0" }}>
            <span>● Done</span><span>○ Not yet</span><span>◌ Upcoming</span><span>– Not scheduled</span>
          </div>
        </section>
      )}

      {period === "Year" && (
        <section className="card" style={{ padding: "16px 12px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", rowGap: 14, justifyItems: "center" }}>
          {Array.from({ length: 12 }, (_, m) => {
            const ds = monthDays(a.getFullYear(), m).filter((d) => d <= t);
            const fs = ds.map((d) => dayFraction(habits, done, d)).filter((f): f is number => f !== null);
            const p = fs.length ? Math.round((fs.reduce((x, y) => x + y, 0) / fs.length) * 100) : null;
            const name = new Date(a.getFullYear(), m, 1).toLocaleDateString("en-GB", { month: "short" });
            return (
              <button key={m} onClick={() => { setPeriod("Month"); setAnchor(`${a.getFullYear()}-${String(m + 1).padStart(2, "0")}-01`); }} disabled={p === null}
                style={{ border: 0, background: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 0 }}>
                {p === null ? <div style={{ width: 56, height: 56, borderRadius: "50%", border: "2px dotted var(--soft)" }} />
                  : <Ring size={56} stroke={5} pct={p}><span style={{ fontSize: 11.5, fontWeight: 800 }}>{p}%</span></Ring>}
                <span className={p === null ? "muted" : ""} style={{ fontSize: 12, fontWeight: 700 }}>{name}</span>
              </button>
            );
          })}
        </section>
      )}

      {flexible.length > 0 && period !== "Year" && (
        <>
          <h2 className="h2">Flexible habits</h2>
          <section className="card group">
            {flexible.map((h) => {
              const p = flexPeriod(h, to < t ? to : t);
              const c = logs.filter((l) => l.habit_id === h.id && l.log_date >= p.from && l.log_date <= p.to).length;
              return (
                <div key={h.id} className="row">
                  <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 700 }}>{h.name}</div><div className="muted" style={{ fontSize: 12 }}>{frequencyLabel(h)} · {p.label.toLowerCase()}</div></div>
                  {c > p.target && <span className="tag tag-accent" style={{ fontWeight: 800 }}>+{c - p.target} bonus</span>}
                  <Ring size={40} stroke={4} pct={(Math.min(c, p.target) / p.target) * 100}><span style={{ fontSize: 11, fontWeight: 800 }}>{Math.min(c, p.target)}/{p.target}</span></Ring>
                </div>
              );
            })}
          </section>
        </>
      )}

      <Sheet open={!!daySheet} onClose={() => setDaySheet(null)} label="Day">
        {daySheet && (() => {
          const hs = habits.filter((h) => isScheduledOn(h, daySheet));
          const n = hs.filter((h) => done.has(`${h.id}|${daySheet}`)).length;
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Ring size={60} stroke={6} pct={hs.length ? (n / hs.length) * 100 : 0}><span style={{ fontSize: 13, fontWeight: 800 }}>{n}/{hs.length}</span></Ring>
                <div style={{ flex: 1 }}><div className="h1" style={{ fontSize: 21 }}>{formatLong(daySheet)}</div><div className="muted" style={{ fontSize: 13 }}>{n} of {hs.length} habits done</div></div>
              </div>
              {hs.length ? (
                <div className="card group">
                  {hs.map((h) => {
                    const on = done.has(`${h.id}|${daySheet}`);
                    return (
                      <div key={h.id} className="row">
                        <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{h.name}</div>
                        <button className="check" aria-pressed={on} aria-label={on ? `Undo ${h.name}` : `Mark ${h.name} done`} onClick={() => toggle(h, daySheet)}>{on && <Icon name="check" stroke={2.4} />}</button>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="muted" style={{ fontSize: 14 }}>No habits were scheduled this day.</div>}
              <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>Forgot to log something? Tap to fill in the day.</div>
            </>
          );
        })()}
      </Sheet>
    </main>
  );
}
