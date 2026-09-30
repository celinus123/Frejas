"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { DayCircle, Ring } from "@/components/Ring";
import { Avatar, Avatars, Empty } from "@/components/ui";
import { CheckInSheet } from "@/components/CheckInSheet";
import { CategoryFilter, categoriesOf, inCategory } from "@/components/CategoryFilter";
import { supabase } from "@/lib/supabase";
import { addDays, dayFraction, flexPeriod, formatLong, frequencyLabel, habitStart, isFlexible, isScheduledOn, parse, startOfWeek, today } from "@/lib/dates";
import { isActive, loadChallenge, loadHabits, loadLogs, logHabit, myChallenges, unlogHabit, type MyChallenge } from "@/lib/data";
import { daysLeft, fmt, ordinal, sharedTotal, standings } from "@/lib/scoring";
import type { Habit, HabitLog } from "@/lib/types";

interface ChallengeCard extends MyChallenge { mine: number; rank: number; of: number; total: number; people: { name: string; path: string | null }[] }

export default function Today() {
  const { userId, profile, toast } = useApp();
  const [allHabits, setHabits] = useState<Habit[] | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [cards, setCards] = useState<ChallengeCard[]>([]);
  const [sheet, setSheet] = useState<{ card: ChallengeCard; habit: Habit; logId: string } | null>(null);
  const t = today();

  const load = useCallback(async () => {
    if (!userId) return;
    const [h, l, mc] = await Promise.all([loadHabits(userId), loadLogs(userId, addDays(t, -40), t), myChallenges(userId)]);
    setHabits(h); setLogs(l);
    const active = mc.filter((x) => isActive(x.challenge));
    const full = await Promise.all(active.map(async (x) => {
      const d = await loadChallenge(x.challenge.id);
      const st = standings(x.challenge, d.members, d.checkins);
      const idx = st.findIndex((s) => s.user_id === userId);
      return {
        ...x, mine: idx >= 0 ? st[idx].value : 0, rank: idx + 1, of: st.length, total: sharedTotal(x.challenge, d.checkins),
        people: d.members.filter((m) => m.user_id !== userId).map((m) => ({ name: m.profiles?.display_name ?? "", path: m.profiles?.avatar_path ?? null })),
      };
    }));
    setCards(full);
  }, [userId, t]);

  useEffect(() => { load().catch(() => setHabits([])); }, [load]);

  const done = useMemo(() => new Set(logs.map((l) => `${l.habit_id}|${l.log_date}`)), [logs]);
  const linked = useMemo(() => {
    const m = new Map<string, ChallengeCard>();
    for (const c of cards) if (c.me.habit_id) m.set(c.me.habit_id, c);
    return m;
  }, [cards]);

  if (!allHabits || !profile) return <main className="page"><div className="skeleton" style={{ height: 60 }} /><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 300 }} /></main>;

  const cats = categoriesOf(allHabits);
  const habits = allHabits.filter((h) => inCategory(h, cat));
  const shownCards = cat ? cards.filter((c) => { const h = allHabits.find((x) => x.id === c.me.habit_id); return !!h && inCategory(h, cat); }) : cards;
  const scheduled = habits.filter((h) => isScheduledOn(h, t));
  const flexible = habits.filter((h) => isFlexible(h) && habitStart(h) <= t);
  const doneToday = scheduled.filter((h) => done.has(`${h.id}|${t}`)).length;
  const pct = scheduled.length ? Math.round((doneToday / scheduled.length) * 100) : 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(t), i));

  async function toggle(h: Habit) {
    if (!userId) return;
    const existing = logs.find((l) => l.habit_id === h.id && l.log_date === t);
    if (existing) {
      setLogs((ls) => ls.filter((l) => l.id !== existing.id));
      try { await unlogHabit(existing.id); } catch { load(); }
      return;
    }
    const temp: HabitLog = { id: `temp-${h.id}`, habit_id: h.id, user_id: userId, log_date: t };
    setLogs((ls) => [...ls, temp]);
    try {
      const log = await logHabit(h.id, userId, t);
      setLogs((ls) => ls.map((l) => (l.id === temp.id ? log : l)));
      const card = linked.get(h.id);
      if (card && card.challenge.unit) {
        setSheet({ card, habit: h, logId: log.id });
        return;
      }
      if (card) {
        const { data } = await supabase().from("check_ins")
          .insert({ challenge_id: card.challenge.id, user_id: userId, habit_log_id: log.id, title: h.name, checkin_date: t }).select().single();
        toast({
          text: <><b>{h.name} done.</b><br />Also checked in to {card.challenge.name}.</>,
          action: data ? { label: "Open", onClick: () => (window.location.href = `/challenges/${card.challenge.id}`) } : undefined,
          undo: () => { setLogs((ls) => ls.filter((l) => l.id !== log.id)); unlogHabit(log.id).then(load); },
        });
        load();
      }
    } catch (e) {
      setLogs((ls) => ls.filter((l) => l.id !== temp.id));
      toast({ text: (e as Error).message || "Couldn't save. Try again." });
    }
  }

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="h1">Hi, {profile.display_name}</h1>
        <Link href="/profile" aria-label="Profile"><Avatar name={profile.display_name} path={profile.avatar_path} size={44} /></Link>
      </div>

      <section className="card" style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="muted" style={{ padding: "0 4px", fontSize: 13, fontWeight: 700 }}>{formatLong(t)}</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {week.map((d) => (
            <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{parse(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
              <DayCircle day={parse(d).getDate()} fraction={dayFraction(habits, done, d)} today={d === t} future={d > t} />
            </div>
          ))}
        </div>
      </section>

      <CategoryFilter categories={cats} value={cat} onChange={setCat} />

      {allHabits.length === 0 ? (
        <Empty icon="leaf" title="Start with one small habit" text="Pick something you can do in two minutes. You can add more later.">
          <Link href="/habits/new" className="btn btn-primary"><Icon name="plus" />Add a habit</Link>
        </Empty>
      ) : (
        <>
          {scheduled.length > 0 && (
            <section style={{ padding: "16px 18px", borderRadius: 24, display: "flex", alignItems: "center", gap: 16, background: "var(--hero)", color: "var(--on-hero)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--hero-ring)" }}>Today's progress</div>
                <div className="font-display" style={{ fontSize: 28, fontWeight: 600 }}>{doneToday} of {scheduled.length} done</div>
              </div>
              <Ring size={76} stroke={8} pct={pct} track="rgba(255, 255, 255, 0.16)" color="var(--hero-ring)"><span style={{ fontSize: 17, fontWeight: 800 }}>{pct}%</span></Ring>
            </section>
          )}

          {scheduled.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2 className="h2">Today</h2></div>
              {scheduled.map((h) => {
                const on = done.has(`${h.id}|${t}`);
                const card = linked.get(h.id);
                return (
                  <div key={h.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 9px 9px 16px", borderRadius: 20 }}>
                    <Link href={`/habits/${h.id}`} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, color: "inherit", textDecoration: "none" }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{h.name}</span>
                      <span className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, flexWrap: "wrap" }}>
                        {frequencyLabel(h)}
                        {h.category && <span className="tag">{h.category}</span>}
                        {card && <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 700, color: "var(--primary)" }}><Icon name="trophy" size={13} />{card.challenge.name}</span>}
                      </span>
                    </Link>
                    <button className="check" aria-pressed={on} aria-label={on ? `Undo ${h.name}` : `Mark ${h.name} done`} onClick={() => toggle(h)}>
                      {on && <Icon name="check" stroke={2.4} />}
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          {flexible.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 className="h2">This week</h2>
              {flexible.map((h) => {
                const p = flexPeriod(h, t);
                const count = logs.filter((l) => l.habit_id === h.id && l.log_date >= p.from && l.log_date <= p.to).length;
                const reached = count >= p.target;
                const todayDone = done.has(`${h.id}|${t}`);
                return (
                  <div key={h.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 9px 9px 16px", borderRadius: 20 }}>
                    <Link href={`/habits/${h.id}`} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{h.name}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{frequencyLabel(h)} · {Math.min(count, p.target)} of {p.target} {p.label.toLowerCase()}</div>
                    </Link>
                    <Ring size={34} stroke={4} pct={(Math.min(count, p.target) / p.target) * 100} />
                    <button className="check" aria-pressed={todayDone} aria-label={todayDone ? `Undo today's ${h.name}` : `Log ${h.name} today`} onClick={() => toggle(h)}
                      style={!todayDone ? { color: "var(--primary)" } : undefined} disabled={reached && !todayDone}>
                      <Icon name={todayDone ? "check" : "plus"} stroke={2.3} size={todayDone ? 20 : 18} />
                    </button>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {shownCards.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 className="h2">Challenges</h2>
            <Link href="/challenges" style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>See all</Link>
          </div>
          <div className="no-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", margin: "0 -20px", padding: "2px 20px 8px" }}>
            {shownCards.map((c, i) => (
              <Link key={c.challenge.id} href={`/challenges/${c.challenge.id}`} className={i === 0 ? "soft" : "card"}
                style={{ width: 236, flexShrink: 0, padding: 16, borderRadius: 24, display: "flex", flexDirection: "column", gap: 12, color: "inherit", textDecoration: "none" }}>
                <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                  <span>{c.challenge.goal_type === "own" ? "Own goals" : "Shared goal"}</span><span>{daysLeft(c.challenge)} days left</span>
                </div>
                <div className="font-display" style={{ fontSize: 20, fontWeight: 600 }}>{c.challenge.name}</div>
                {c.challenge.goal_type === "own" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Ring size={44} stroke={5} pct={c.mine} track={i === 0 ? "var(--surface)" : "var(--soft)"}><span style={{ fontSize: 11, fontWeight: 800 }}>{c.mine}%</span></Ring>
                    <div style={{ flex: 1 }}><span className="tag tag-accent" style={{ fontSize: 12.5, fontWeight: 800 }}>{ordinal(c.rank)} of {c.of}</span></div>
                    <Avatars people={c.people} size={24} ring={i === 0 ? "var(--soft)" : "var(--surface)"} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="muted" style={{ fontSize: 13 }}><b style={{ color: "var(--ink)", fontSize: 15 }}>{fmt(c.total)}</b> / {fmt(c.challenge.shared_target ?? 0)} {c.challenge.unit ?? "check-ins"}</div>
                    <div style={{ height: 8, borderRadius: 4, background: i === 0 ? "var(--surface)" : "var(--soft)" }}>
                      <div style={{ width: `${Math.min(100, (c.total / (c.challenge.shared_target || 1)) * 100)}%`, height: 8, borderRadius: 4, background: "var(--primary)" }} />
                    </div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {sheet && userId && (
        <CheckInSheet open onClose={() => { setSheet(null); load(); }} onSaved={() => toast({ text: <>Checked in to <b>{sheet.card.challenge.name}</b>.</> })}
          challenge={sheet.card.challenge} userId={userId} habitId={sheet.habit.id} habitName={sheet.habit.name} habitLogId={sheet.logId} />
      )}
    </main>
  );
}
