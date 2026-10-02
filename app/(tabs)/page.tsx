"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { DayCircle, Ring } from "@/components/Ring";
import { Avatars, Empty, Sheet } from "@/components/ui";
import { PageHead } from "@/components/PageHead";
import { SwipeRow } from "@/components/SwipeRow";
import { CheckInSheet } from "@/components/CheckInSheet";
import { CHALLENGES, CategoryFilter, categoriesOf, inCategory } from "@/components/CategoryFilter";
import { similar } from "@/lib/similar";
import { D } from "@/lib/design";
import { celebrate, tap } from "@/lib/native";
import { supabase } from "@/lib/supabase";
import { addDays, dayFraction, flexPeriod, formatLong, formatShort, frequencyLabel, habitStart, isFlexible, isScheduledOn, parse, startOfWeek, today } from "@/lib/dates";
import { isActive, loadChallenge, loadHabits, loadLogs, logHabit, myChallenges, unlogHabit, type MyChallenge } from "@/lib/data";
import { daysLeft, fmt, ordinal, sharedTotal, standings } from "@/lib/scoring";
import type { Habit, HabitLog } from "@/lib/types";

interface ChallengeCard extends MyChallenge { mine: number; pct: number; done: number; target: number; rank: number; of: number; total: number; people: { name: string; path: string | null }[] }

export default function Today() {
  const { userId, profile, toast } = useApp();
  const [allHabits, setHabits] = useState<Habit[] | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [cards, setCards] = useState<ChallengeCard[]>([]);
  const [mine, setMine] = useState<MyChallenge[]>([]);
  const [noMerge, setNoMerge] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ card: ChallengeCard; habit: Habit; logId: string; date: string } | null>(null);
  const t = today();
  const router = useRouter();
  const [sel, setSel] = useState(t);                       // the day you're looking at
  const [from, setFrom] = useState(() => addDays(t, -40)); // how far back logs are loaded
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [delHabit, setDelHabit] = useState<Habit | null>(null);
  const [tip, setTip] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try { setTip(!localStorage.getItem("frejas-tip-swipe")); setNoMerge(JSON.parse(localStorage.getItem("frejas-no-merge") || "[]")); } catch { /* storage blocked */ }
  }, []);
  const hideTip = () => { setTip(false); try { localStorage.setItem("frejas-tip-swipe", "1"); } catch { /* ignore */ } };

  function pickDay(d: string) {
    const day = d > t ? t : d;
    setSel(day);
    setOpenRow(null);
    if (startOfWeek(day) < from) setFrom(addDays(startOfWeek(day), -7));
  }

  const load = useCallback(async () => {
    if (!userId) return;
    const [h, l, mc] = await Promise.all([loadHabits(userId), loadLogs(userId, from, t), myChallenges(userId)]);
    setHabits(h); setLogs(l); setMine(mc);
    const active = mc.filter((x) => isActive(x.challenge));
    const full = await Promise.all(active.map(async (x) => {
      const d = await loadChallenge(x.challenge.id);
      const st = standings(x.challenge, d.members, d.checkins);
      const idx = st.findIndex((s) => s.user_id === userId);
      return {
        ...x, mine: idx >= 0 ? st[idx].value : 0, pct: idx >= 0 ? st[idx].progress : 0, done: idx >= 0 ? st[idx].done : 0, target: idx >= 0 ? st[idx].target : 0, rank: idx + 1, of: st.length, total: sharedTotal(x.challenge, d.checkins),
        people: d.members.filter((m) => m.user_id !== userId).map((m) => ({ name: m.profiles?.display_name ?? "", path: m.profiles?.avatar_path ?? null })),
      };
    }));
    setCards(full);
  }, [userId, t, from]);

  useEffect(() => { load().catch(() => setHabits([])); }, [load]);

  const done = useMemo(() => new Set(logs.map((l) => `${l.habit_id}|${l.log_date}`)), [logs]);
  const linked = useMemo(() => {
    const m = new Map<string, ChallengeCard>();
    for (const c of cards) if (c.me.habit_id) m.set(c.me.habit_id, c);
    return m;
  }, [cards]);

  if (!allHabits || !profile) return <main className="page"><div className="skeleton" style={{ height: 60 }} /><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 300 }} /></main>;

  const cats = categoriesOf(allHabits);
  const chIds = new Set(cards.map((c) => c.me.habit_id).filter((x): x is string => !!x));
  const habits = allHabits.filter((h) => inCategory(h, cat, chIds));
  const shownCards = cat && cat !== CHALLENGES ? cards.filter((c) => { const h = allHabits.find((x) => x.id === c.me.habit_id); return !!h && inCategory(h, cat, chIds); }) : cards;

  // a challenge habit that looks like one you already had: offer to merge them
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  let suggestion: { from: Habit; into: Habit; challenge: string } | null = null;
  for (const c of cards) {
    const l = allHabits.find((h) => h.id === c.me.habit_id);
    if (!l) continue;
    const o = allHabits.find((h) => h.id !== l.id && !chIds.has(h.id) && similar(h.name, l.name) && !noMerge.includes(pairKey(l.id, h.id)));
    if (!o) continue;
    const into = l.from_challenge && !o.from_challenge ? o : !l.from_challenge && o.from_challenge ? l : l.created_at <= o.created_at ? l : o;
    suggestion = { from: into.id === l.id ? o : l, into, challenge: c.challenge.name };
    break;
  }
  // a habit made for a challenge that has ended: keep it or put it away?
  const ended = allHabits.map((h) => ({ h, c: mine.find((m) => m.challenge.id === h.from_challenge && m.challenge.ends_on < t)?.challenge }))
    .find((x) => x.c);

  async function merge(from: Habit, into: Habit) {
    const { error } = await supabase().rpc("merge_habits", { p_from: from.id, p_into: into.id });
    if (error) { toast({ text: error.message }); return; }
    toast({ text: <>Merged into <b>{into.name}</b>. All ticks are kept.</> });
    load();
  }
  function keepBoth(a: Habit, b: Habit) {
    const next = [...noMerge, pairKey(a.id, b.id)];
    setNoMerge(next);
    try { localStorage.setItem("frejas-no-merge", JSON.stringify(next)); } catch { /* ignore */ }
  }
  async function keepHabit(h: Habit, keep: boolean) {
    const { error } = await supabase().from("habits").update(keep ? { from_challenge: null } : { archived_at: new Date().toISOString() }).eq("id", h.id);
    if (error) { toast({ text: error.message }); return; }
    toast({ text: keep ? <><b>{h.name}</b> stays on Today.</> : <><b>{h.name}</b> archived. Find it under Profile → Archived habits.</> });
    load();
  }
  const isToday = sel === t;
  const scheduled = habits.filter((h) => isScheduledOn(h, sel));
  const flexible = habits.filter((h) => isFlexible(h) && habitStart(h) <= sel);
  const doneToday = scheduled.filter((h) => done.has(`${h.id}|${sel}`)).length;
  const pct = scheduled.length ? Math.round((doneToday / scheduled.length) * 100) : 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(sel), i));
  const dayTitle = isToday ? "Today" : parse(sel).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

  async function deleteHabit(h: Habit, archive: boolean) {
    setDelHabit(null);
    const { error } = archive
      ? await supabase().from("habits").update({ archived_at: new Date().toISOString() }).eq("id", h.id)
      : await supabase().from("habits").delete().eq("id", h.id);
    if (error) { toast({ text: error.message }); return; }
    toast({ text: archive ? <><b>{h.name}</b> archived. Find it under Profile → Archived habits.</> : <><b>{h.name}</b> deleted.</> });
    load();
  }

  async function toggle(h: Habit) {
    if (!userId) return;
    const day = sel;
    const existing = logs.find((l) => l.habit_id === h.id && l.log_date === day);
    if (existing) {
      setLogs((ls) => ls.filter((l) => l.id !== existing.id));
      try { await unlogHabit(existing.id); } catch { load(); }
      return;
    }
    const allDone = scheduled.length > 0 && scheduled.every((x) => x.id === h.id || done.has(`${x.id}|${day}`));
    if (allDone && isScheduledOn(h, day)) celebrate(); else tap();
    const temp: HabitLog = { id: `temp-${h.id}`, habit_id: h.id, user_id: userId, log_date: day };
    setLogs((ls) => [...ls, temp]);
    try {
      const log = await logHabit(h.id, userId, day);
      setLogs((ls) => ls.map((l) => (l.id === temp.id ? log : l)));
      const found = linked.get(h.id);
      const card = found && found.challenge.starts_on <= day && day <= found.challenge.ends_on ? found : undefined;
      if (card && card.challenge.unit) {
        setSheet({ card, habit: h, logId: log.id, date: day });
        return;
      }
      if (card) {
        const { data } = await supabase().from("check_ins")
          .insert({ challenge_id: card.challenge.id, user_id: userId, habit_log_id: log.id, title: h.name, checkin_date: day }).select().single();
        toast({
          text: <><b>{h.name} done{day === t ? "" : ` for ${formatShort(day)}`}.</b><br />Also checked in to {card.challenge.name}.</>,
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
      <PageHead title={<>Hi, {profile.display_name}</>} />

      <section className="card" style={{ padding: "8px 8px 14px", display: "flex", flexDirection: "column", gap: 8, touchAction: "pan-y" }}
        onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const s0 = swipe.current; swipe.current = null;
          if (!s0) return;
          const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) pickDay(addDays(sel, dx < 0 ? 7 : -7));
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button className="icon-btn" aria-label="Previous week" onClick={() => pickDay(addDays(sel, -7))} style={{ width: 34, height: 34, boxShadow: "none", background: "none" }}><Icon name="left" size={18} /></button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700 }} aria-live="polite">{formatLong(sel)}</div>
          {isToday
            ? <button className="icon-btn" aria-label="Next week" disabled style={{ width: 34, height: 34, boxShadow: "none", background: "none", opacity: 0.25 }}><Icon name="right" size={18} /></button>
            : <button onClick={() => pickDay(t)} className="tag" style={{ border: 0, fontSize: 12, fontWeight: 800, padding: "5px 10px", background: "var(--primary)", color: "var(--on-primary)" }}>Today</button>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px" }}>
          {week.map((d) => (
            <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{parse(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
              <DayCircle day={parse(d).getDate()} fraction={dayFraction(habits, done, d)} today={d === t} future={d > t} selected={d === sel} onClick={() => pickDay(d)} />
            </div>
          ))}
        </div>
      </section>

      <CategoryFilter categories={cats} value={cat} onChange={setCat} challenges={chIds.size > 0} />

      {suggestion && (
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name="repeat" color="var(--primary)" />
            <div style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>
              <b>{suggestion.from.name}</b> and <b>{suggestion.into.name}</b> look like the same thing. Merge them into <b>{suggestion.into.name}</b>?
              <div className="muted" style={{ fontSize: "var(--t-sub)", marginTop: 4 }}>All ticks from both are kept. Ticking {suggestion.into.name} counts for {suggestion.challenge}, and it keeps going after the challenge ends.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-soft btn-sm" style={{ flex: 1 }} onClick={() => keepBoth(suggestion!.from, suggestion!.into)}>Keep both</button>
            <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => merge(suggestion!.from, suggestion!.into)}>Merge</button>
          </div>
        </section>
      )}

      {!suggestion && ended && (
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name="flag" color="var(--primary)" />
            <div style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>
              <b>{ended.c!.name}</b> has ended. Keep <b>{ended.h.name}</b> as a habit on Today?
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-soft btn-sm" style={{ flex: 1 }} onClick={() => keepHabit(ended.h, false)}>Archive it</button>
            <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => keepHabit(ended.h, true)}>Keep it</button>
          </div>
        </section>
      )}

      {allHabits.length === 0 ? (
        <Empty icon="leaf" title="Start with one small habit" text="Pick something you can do in two minutes. You can add more later.">
          <Link href="/habits/new" className="btn btn-primary"><Icon name="plus" />Add a habit</Link>
        </Empty>
      ) : (
        <>
          {scheduled.length > 0 && (
            <section style={{ padding: "16px 18px", borderRadius: 24, display: "flex", alignItems: "center", gap: 16, background: "var(--hero)", color: "var(--on-hero)" }}>
              <div style={{ flex: 1 }}>
                <div className="t-meta" style={{ fontWeight: 700, color: "var(--hero-ring)" }}>{isToday ? "Today's progress" : `Progress · ${formatShort(sel)}`}</div>
                <div className="font-display" style={{ fontSize: "var(--t-display)", fontWeight: 600 }}>{doneToday} of {scheduled.length} done</div>
              </div>
              <Ring size={76} stroke={8} pct={pct} track="rgba(255, 255, 255, 0.16)" color="var(--hero-ring)"><span style={{ fontSize: 17, fontWeight: 800 }}>{pct}%</span></Ring>
            </section>
          )}

          {scheduled.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2 className="h2">{dayTitle}</h2>
                {!isToday && <span className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>Tick what you did</span>}</div>
              {tip && (
                <div className="muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-sub)", padding: "0 4px" }}>
                  <span style={{ flex: 1 }}>Tip: swipe a habit to the left to edit or delete it. Tap a date above to fill in an earlier day.</span>
                  <button onClick={hideTip} aria-label="Hide tip" style={{ border: 0, background: "none", color: "inherit", padding: 4 }}><Icon name="x" size={16} /></button>
                </div>
              )}
              {scheduled.map((h) => {
                const on = done.has(`${h.id}|${sel}`);
                const card = linked.get(h.id);
                return (
                  <SwipeRow key={h.id} label={h.name} open={openRow === h.id} onOpenChange={(o) => setOpenRow(o ? h.id : null)}
                    onEdit={() => router.push(`/habits/${h.id}/edit`)} onDelete={() => setDelHabit(h)}>
                  <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 9px 9px 16px", borderRadius: 20 }}>
                    <Link href={`/habits/${h.id}`} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, color: "inherit", textDecoration: "none" }}>
                      <span style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{h.name}</span>
                      <span className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sub)", flexWrap: "wrap" }}>
                        {frequencyLabel(h)}
                        {h.category && <span className="tag">{h.category}</span>}
                        {card && <span className="t-tag" style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--primary)" }}><Icon name="trophy" size={D.icon.inline} />{card.challenge.name}</span>}
                      </span>
                    </Link>
                    <button className="check" aria-pressed={on} aria-label={on ? `Undo ${h.name}` : `Mark ${h.name} done`} onClick={() => toggle(h)}>
                      {on && <Icon name="check" stroke={2.4} />}
                    </button>
                  </div>
                  </SwipeRow>
                );
              })}
            </section>
          )}

          {flexible.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 className="h2">{isToday ? "This week" : `Week of ${formatShort(startOfWeek(sel))}`}</h2>
              {flexible.map((h) => {
                const p = flexPeriod(h, sel);
                const count = logs.filter((l) => l.habit_id === h.id && l.log_date >= p.from && l.log_date <= p.to).length;
                const reached = count >= p.target;
                const todayDone = done.has(`${h.id}|${sel}`);
                return (
                  <SwipeRow key={h.id} label={h.name} open={openRow === h.id} onOpenChange={(o) => setOpenRow(o ? h.id : null)}
                    onEdit={() => router.push(`/habits/${h.id}/edit`)} onDelete={() => setDelHabit(h)}>
                  <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 9px 9px 16px", borderRadius: 20 }}>
                    <Link href={`/habits/${h.id}`} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
                      <div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{h.name}</div>
                      <div className="muted" style={{ display: "flex", alignItems: "center", columnGap: 6, rowGap: 3, flexWrap: "wrap", fontSize: "var(--t-sub)", marginTop: 3 }}>
                        <span>{frequencyLabel(h)} · {Math.min(count, p.target)} of {p.target} {p.label.toLowerCase()}</span>
                        {count > p.target && <span className="tag tag-accent" style={{ fontWeight: 800, color: "var(--ink)" }}>+{count - p.target} bonus</span>}
                        {h.category && <span className="tag">{h.category}</span>}
                        {linked.get(h.id) && <span className="t-tag" style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--primary)" }}><Icon name="trophy" size={D.icon.inline} />{linked.get(h.id)!.challenge.name}</span>}
                      </div>
                    </Link>
                    <button className="flex-check" aria-pressed={todayDone} onClick={() => toggle(h)}
                      aria-label={todayDone ? `Undo ${h.name} for ${dayTitle}` : `Log ${h.name} for ${dayTitle}. ${count} of ${p.target} done`}>
                      <Ring size={40} stroke={4} pct={(Math.min(count, p.target) / p.target) * 100} track="var(--ring-track)">
                        {todayDone && <span className="flex-check-dot"><Icon name="check" stroke={2.6} size={15} /></span>}
                      </Ring>
                    </button>
                  </div>
                  </SwipeRow>
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
                <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-sub)", fontWeight: 700 }}>
                  <span>{c.challenge.solo ? "Challenge" : "Challenge with friends"}</span><span>{daysLeft(c.challenge)} {daysLeft(c.challenge) === 1 ? "day" : "days"} left</span>
                </div>
                <div className="font-display" style={{ fontSize: 20, fontWeight: 600 }}>{c.challenge.name}</div>
                {c.challenge.goal_type === "own" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Ring size={46} stroke={5} pct={c.pct} track={i === 0 ? "var(--surface)" : "var(--soft)"}><span className="ring-num" style={{ fontSize: 11 }}>{c.pct}%</span></Ring>
                    {/* your place only means something when there is someone to compare with */}
                    <div style={{ flex: 1 }}>{!c.challenge.solo && c.of > 1 && c.rank > 0
                      ? <span className="tag tag-accent" style={{ fontSize: 12.5, fontWeight: 800 }}>{ordinal(c.rank)} place</span>
                      : <span className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>{c.done} of {c.target} sessions</span>}</div>
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
          challenge={sheet.card.challenge} userId={userId} habitId={sheet.habit.id} habitName={sheet.habit.name} habitLogId={sheet.logId} initialDate={sheet.date} />
      )}
      <Sheet open={!!delHabit} onClose={() => setDelHabit(null)} label="Delete habit">
        {delHabit && (
          <>
            <div className="h1" style={{ fontSize: 24 }}>Delete {delHabit.name}?</div>
            <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
              Deleting removes the habit and all its ticks for good. Check-ins you&apos;ve posted in challenges stay.
              Archiving hides it but keeps your history. You can bring it back from Profile → Archived habits.
            </p>
            <button className="btn btn-primary" onClick={() => deleteHabit(delHabit, false)}><Icon name="trash" />Delete for good</button>
            <button className="btn btn-soft" onClick={() => deleteHabit(delHabit, true)}><Icon name="archive" />Archive instead</button>
            <button className="btn" style={{ background: "none" }} onClick={() => setDelHabit(null)}>Cancel</button>
          </>
        )}
      </Sheet>
    </main>
  );
}
