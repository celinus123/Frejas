"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { addDays, formatShort, frequencyLabel, habitStart, isScheduledOn, today } from "@/lib/dates";
import type { Frequency, Habit } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Avatar, Switch } from "./ui";
import { MAX_CATEGORIES, SUGGESTED_CATEGORIES, categoriesOf } from "./CategoryFilter";
import { habitViewers, loadHabits, myFriends, pairHabits, setHabitViewers, unpairHabit, type Friend } from "@/lib/data";
import { bestMatch } from "@/lib/similar";
import { ReminderField } from "./ReminderField";
import { enablePush, hhmm } from "@/lib/push";

const FREQS: { v: Frequency; l: string }[] = [
  { v: "daily", l: "Daily" }, { v: "specific_days", l: "Specific days" }, { v: "times_per_week", l: "Times a week" },
  { v: "every_other_week", l: "Every other week" }, { v: "monthly", l: "Monthly" },
];
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const IDEAS = ["Drink water", "Walk 10 min", "Read 10 pages", "Stretch"];

export function HabitForm({ habit }: { habit?: Habit }) {
  const router = useRouter();
  const { userId, profile, toast } = useApp();
  const [name, setName] = useState(habit?.name ?? "");
  const [freq, setFreq] = useState<Frequency>(habit?.frequency ?? "daily");
  const [days, setDays] = useState<number[]>(habit?.days ?? [1, 3, 5]);
  const [times, setTimes] = useState(habit?.times_per_week ?? 3);
  const [category, setCategory] = useState<string | null>(habit?.category ?? null);
  const [remind, setRemind] = useState(hhmm(habit?.reminder_time));   // "07:30", or "" for none
  // who can see it: only you, all your friends, or the friends you pick
  const [audience, setAudience] = useState<"private" | "friends" | "chosen">(habit ? (habit.visibility === "friends" ? "friends" : "private") : (profile?.new_habits_private ?? true) ? "private" : "friends");
  const [viewers, setViewers] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const t = today();
  const [start, setStart] = useState(habit ? habitStart(habit) : t);   // first day it counts; may be before today
  const [fill, setFill] = useState(true);                              // tick the days since then
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [used, setUsed] = useState<string[]>([]);       // categories on your other habits
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [catErr, setCatErr] = useState<string | null>(null);
  const [others, setOthers] = useState<Habit[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  const [mergeHow, setMergeHow] = useState<"this" | "other" | "both">("this");   // which one stays, or both
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    loadHabits(userId).then((hs) => { const rest = hs.filter((h) => h.id !== habit?.id); setUsed(categoriesOf(rest)); setOthers(rest); }).catch(() => {});
  }, [userId, habit?.id]);

  useEffect(() => {
    if (!userId) return;
    myFriends(userId).then(setFriends).catch(() => {});
    if (habit) habitViewers(habit.id).then((v) => { if (v.length) { setViewers(new Set(v)); if (habit.visibility !== "friends") setAudience("chosen"); } }).catch(() => {});
  }, [userId, habit]);

  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const options = [...used, ...SUGGESTED_CATEGORIES.filter((c) => !used.some((u) => same(u, c)))];
  if (category && !options.some((o) => same(o, category))) options.push(category);
  const full = used.length >= MAX_CATEGORIES;

  function pick(c: string) {
    setCatErr(null);
    if (category && same(category, c)) return setCategory(null);
    if (full && !used.some((u) => same(u, c))) return setCatErr(`You already have ${MAX_CATEGORIES} categories. Pick one of them, or move habits out of one you don't use.`);
    setCategory(c);
  }
  function addCategory() {
    const raw = draft.trim().replace(/\s+/g, " ");
    if (!raw) { setAdding(false); return; }
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const existing = options.find((o) => same(o, name));
    setAdding(false); setDraft("");
    pick(existing ?? name);
  }

  const valid = name.trim().length > 0 && (freq !== "specific_days" || days.length > 0);

  // days between an earlier start and yesterday that this schedule asks for (only fixed schedules can be filled in for you)
  const fixed = freq === "daily" || freq === "specific_days";
  const backDays: string[] = [];
  if (!habit && fixed && start < t) {
    const probe = { frequency: freq, days: freq === "specific_days" ? days : null, starts_on: start, created_at: new Date().toISOString() } as Habit;
    for (let d = start; d < t && backDays.length < 366; d = addDays(d, 1)) if (isScheduledOn(probe, d)) backDays.push(d);
  }

  async function save() {
    if (!userId) return;
    if (!name.trim()) { setErr("Give the habit a name first."); nameRef.current?.focus(); return; }
    if (!valid) { setErr("Pick at least one day."); return; }
    if (audience === "chosen" && viewers.size === 0) { setErr("Pick at least one friend, or choose Only me."); return; }
    const seenBy = audience === "chosen" ? [...viewers] : [];
    setBusy(true); setErr(null);
    if (remind) await enablePush();   // in the iPhone app: the phone asks once whether Frejas may send notifications
    const row = {
      name: name.trim(), frequency: freq,
      days: freq === "specific_days" ? [...days].sort() : null,
      times_per_week: freq === "times_per_week" ? times : null,
      category, visibility: audience === "friends" ? "friends" : "private", reminder_time: remind || null,
      ...(habit ? (start !== habitStart(habit) ? { starts_on: start } : {}) : { starts_on: start < t ? start : null }),
    };
    if (habit) {
      const { error } = await supabase().from("habits").update(row).eq("id", habit.id);
      if (error) { setBusy(false); return setErr(error.message); }
      try { await setHabitViewers(habit.id, seenBy); } catch (e) { setBusy(false); return setErr(`Saved, but the list of friends couldn't be updated: ${(e as Error).message}`); }
      setBusy(false);
      router.replace(`/habits/${habit.id}`);
      return;
    }
    const { data, error } = await supabase().from("habits").insert({ ...row, owner_id: userId }).select("id").single();
    if (error) { setBusy(false); return setErr(error.message); }
    if (seenBy.length) await setHabitViewers(data.id, seenBy).catch(() => toast({ text: "The habit is saved as private: the list of friends couldn't be stored. Open it and try again." }));
    if (fill && backDays.length) {
      const { error: le } = await supabase().from("habit_logs").insert(backDays.map((d) => ({ habit_id: data.id, user_id: userId, log_date: d, created_at: new Date(`${d}T12:00:00`).toISOString() })));
      if (le) toast({ text: "Habit saved, but the earlier days couldn't be ticked. Fill them in on Today." });
      else toast({ text: <><b>{backDays.length} earlier {backDays.length === 1 ? "day" : "days"} ticked.</b> Tap a date on Today to change one.</> });
    } else if (start < t) toast({ text: <>Started {formatShort(start)}. Tap a date on Today to tick what you did.</> });
    setBusy(false);
    router.replace("/");
  }

  async function archive() {
    if (!habit) return;
    const { error } = await supabase().from("habits").update({ archived_at: habit.archived_at ? null : new Date().toISOString() }).eq("id", habit.id);
    if (error) return setErr(error.message);
    toast({ text: habit.archived_at ? "Habit restored." : "Habit archived. Your history is kept." });
    router.replace("/");
  }

  // Two habits that are really one: keep this one, keep the other one, or keep both and tick them together.
  async function merge() {
    if (!habit || !mergeInto) return;
    const other = others.find((o) => o.id === mergeInto);
    if (!other) return;
    setErr(null);
    if (mergeHow === "both") {
      try { await pairHabits(habit, other); }
      catch (e) { return setErr(/linked_habit_id/.test((e as Error).message) ? "Ticking two habits together isn't switched on yet. Try again in a little while." : (e as Error).message); }
      toast({ text: <><b>{habit.name}</b> and <b>{other.name}</b> are now ticked together.</> });
      router.replace(`/habits/${habit.id}`);
      return;
    }
    const [from, into] = mergeHow === "this" ? [other, habit] : [habit, other];
    if (!confirm(`Keep "${into.name}"? All ticks from "${from.name}" move over and "${from.name}" disappears. Challenges it counted for will count "${into.name}" instead.`)) return;
    const { error } = await supabase().rpc("merge_habits", { p_from: from.id, p_into: into.id });
    if (error) return setErr(error.message);
    toast({ text: <>Merged into <b>{into.name}</b>. All ticks are kept.</> });
    router.replace(`/habits/${into.id}`);
  }
  async function unpair() {
    if (!habit) return;
    try { await unpairHabit(habit); } catch (e) { return setErr((e as Error).message); }
    toast({ text: "They're ticked separately again." });
    router.replace(`/habits/${habit.id}`);
  }

  async function remove() {
    if (!habit) return;
    if (!confirm(`Delete "${habit.name}" and its history? Check-ins already posted in challenges stay. This can't be undone.`)) return;
    const { error } = await supabase().from("habits").delete().eq("id", habit.id);
    if (error) return setErr(error.message);
    toast({ text: "Habit deleted." });
    router.replace("/");
  }

  return (
    <main className="page" style={{ gap: 12, paddingBottom: 0, minHeight: "100dvh" }}>
      {/* Save is the wide button at the bottom of the page, where every other form in the app has it */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
        <button onClick={() => router.back()} style={{ border: 0, background: "none", fontSize: 15, fontWeight: 600, color: "var(--ink-2)", height: 44, minWidth: 60, textAlign: "left", padding: 0 }}>Cancel</button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{habit ? "Edit habit" : "New habit"}</div>
        <div style={{ width: 60 }} />
      </div>

      <label className="field"><input ref={nameRef} autoFocus={!habit} maxLength={60} placeholder="e.g. Read 20 minutes" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} aria-label="Habit name" /></label>
      {!habit && name.trim().length >= 3 && (() => {
        const twin = bestMatch(name, others);
        return twin && (
          <div className="soft" role="status" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 16, fontSize: 13.5, lineHeight: 1.4 }}>
            <Icon name="repeat" size={18} color="var(--primary)" />
            <span style={{ flex: 1 }}>You already have <b>{twin.name}</b>. Use that one instead of making a copy?</span>
            <button className="btn btn-sm" style={{ background: "var(--surface)", height: 34 }} onClick={() => router.replace(`/habits/${twin.id}`)}>Open it</button>
          </div>
        );
      })()}
      {!habit && !name && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{IDEAS.map((i) => <button key={i} className="chip" onClick={() => setName(i)}>{i}</button>)}</div>
      )}

      <div className="label">How often</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FREQS.map((f) => <button key={f.v} className="chip" aria-pressed={freq === f.v} onClick={() => setFreq(f.v)}>{f.l}</button>)}
      </div>

      {freq === "specific_days" && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {DAYS.map((d, i) => {
            const n = i + 1, on = days.includes(n);
            return (
              <button key={n} aria-label={DAY_NAMES[i]} aria-pressed={on} onClick={() => setDays((ds) => on ? ds.filter((x) => x !== n) : [...ds, n])}
                style={{ width: 42, height: 42, borderRadius: "50%", border: 0, fontSize: 13, fontWeight: 800, background: on ? "var(--primary)" : "var(--surface)", color: on ? "var(--on-primary)" : "var(--ink)", boxShadow: on ? "none" : "var(--shadow)" }}>{d}</button>
            );
          })}
        </div>
      )}
      {freq === "times_per_week" && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 16 }}>
          <button aria-label="Fewer" onClick={() => setTimes((x) => Math.max(1, x - 1))} className="round-btn"><Icon name="minus" /></button>
          <div style={{ flex: 1, textAlign: "center" }}><span className="font-display" style={{ fontSize: 30, fontWeight: 600 }}>{times}</span><span className="muted" style={{ fontSize: 14 }}> times a week</span></div>
          <button aria-label="More" onClick={() => setTimes((x) => Math.min(7, x + 1))} className="round-btn"><Icon name="plus" /></button>
        </div>
      )}
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.4 }}>
        Shows as <b style={{ color: "var(--ink)" }}>{frequencyLabel({ frequency: freq, days, times_per_week: times })}</b>
        {["times_per_week", "every_other_week", "monthly"].includes(freq) && " · any day you like, under This week on Today"}
      </div>

      <div className="label">{habit ? "Started" : "Starts"}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!habit && <button className="chip" aria-pressed={start === t} onClick={() => setStart(t)}>Today</button>}
        {!habit && <button className="chip" aria-pressed={start === addDays(t, -1)} onClick={() => setStart(addDays(t, -1))}>Yesterday</button>}
        {habit && habitStart(habit) > t ? <span className="chip"><Icon name="calendar" size={15} />{formatShort(start)} · with its challenge</span> :
        <label className="chip" aria-pressed={!!habit || (start !== t && start !== addDays(t, -1))} style={{ position: "relative", cursor: "pointer" }}>
          <Icon name="calendar" size={15} />{habit || (start !== t && start !== addDays(t, -1)) ? formatShort(start) : "Earlier date"}
          <input type="date" max={t} min={addDays(t, -365)} value={start} onChange={(e) => e.target.value && setStart(e.target.value > t ? t : e.target.value)} aria-label="Start date"
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
        </label>}
      </div>
      {!habit && start < t && (fixed ? (
        <div className="card" style={{ borderRadius: 16 }}>
          <div className="row">
            <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>I did it every time since then</div>
              <div className="muted" style={{ fontSize: "var(--t-sub)" }}>{fill ? `Ticks ${backDays.length} ${backDays.length === 1 ? "day" : "days"} for you, ${formatShort(start)} to yesterday` : "You tick the earlier days yourself on Today"}</div></div>
            <Switch on={fill} onChange={setFill} label="Tick the days since the start" />
          </div>
        </div>
      ) : <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>Counts from {formatShort(start)}. After saving, tap a date on Today to tick the days you did it.</div>)}
      {habit && start !== habitStart(habit) && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>
        {start < habitStart(habit) ? "Days from then on count. Tap a date on Today to tick what you did." : "Days before this date stop counting. Ticks you made are kept."}</div>}

      <div className="label">Category <span style={{ fontWeight: 600 }}>· optional</span></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((c) => <button key={c} className="chip" aria-pressed={!!category && same(category, c)} onClick={() => pick(c)}>{c}</button>)}
        {adding ? (
          <label className="chip" style={{ paddingRight: 6 }}>
            <input autoFocus maxLength={24} value={draft} placeholder="New category" aria-label="New category"
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") { setAdding(false); setDraft(""); } }}
              onBlur={addCategory} style={{ border: 0, outline: 0, background: "none", width: 110, fontWeight: 700 }} />
          </label>
        ) : !full && (
          <button className="chip" onClick={() => { setAdding(true); setCatErr(null); }} style={{ color: "var(--ink-2)" }}><Icon name="plus" size={15} stroke={2.2} />New</button>
        )}
      </div>
      {catErr ? <div role="alert" className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", color: "var(--ink)" }}>{catErr}</div>
        : used.length >= MAX_CATEGORIES - 3 && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>{used.length} of {MAX_CATEGORIES} categories used.</div>}

      <div className="label">Reminder <span style={{ fontWeight: 600 }}>· optional</span></div>
      <ReminderField value={remind} onChange={setRemind} when={freq === "specific_days" && days.length ? "On the days you picked" : "Every day"} />

      <div className="label">Who can see it</div>
      <div className="card group" role="radiogroup" aria-label="Who can see it">
        {([["private", "lock", "Only me", "Nobody else sees it"],
           ["friends", "users", "All friends", "Everyone you share a challenge with or have added as a friend"],
           ["chosen", "user", "Chosen friends", friends.length ? "Only the friends you pick below" : "Add a friend first, then you can pick who sees it"]] as const).map(([v, icon, title, sub]) => {
          const off = v === "chosen" && !friends.length;
          return (
            <button key={v} role="radio" aria-checked={audience === v} disabled={off} onClick={() => { setAudience(v); setErr(null); }} className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left", opacity: off ? 0.5 : 1 }}>
              <Icon name={icon} color="var(--primary)" />
              <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{title}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{sub}</div></div>
              <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{audience === v && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)" }} />}</span>
            </button>
          );
        })}
      </div>
      {audience === "chosen" && friends.length > 0 && (
        <>
          <div className="card group">
            {friends.map((f) => {
              const on = viewers.has(f.id);
              return (
                <button key={f.id} role="checkbox" aria-checked={on} onClick={() => { setErr(null); setViewers((v) => { const n = new Set(v); if (on) n.delete(f.id); else n.add(f.id); return n; }); }}
                  className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}>
                  <Avatar name={f.display_name} path={f.avatar_path} size={34} />
                  <div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>{f.display_name}</div>
                  <span style={{ width: 26, height: 26, borderRadius: 9, border: on ? 0 : "2px solid var(--primary)", background: on ? "var(--primary)" : "none", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{on && <Icon name="check" size={15} stroke={2.6} />}</span>
                </button>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>
            {viewers.size ? `${viewers.size} ${viewers.size === 1 ? "friend sees" : "friends see"} this habit and when you tick it. Nobody else does.` : "Tick the friends who should see this habit."}
          </div>
        </>
      )}

      {habit && (
        <div className="card group" style={{ marginTop: 10 }}>
          <button className="row" onClick={archive} style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}>
            <Icon name="archive" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{habit.archived_at ? "Restore habit" : "Archive habit"}</div>
              <div className="muted" style={{ fontSize: "var(--t-sub)" }}>Hide it from Today, keep your history</div></div>
          </button>
          {habit.linked_habit_id && others.some((o) => o.id === habit.linked_habit_id) && (
            <div className="row">
              <Icon name="link" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Ticked together with {others.find((o) => o.id === habit.linked_habit_id)!.name}</div>
                <div className="muted" style={{ fontSize: "var(--t-sub)" }}>Ticking one ticks the other</div></div>
              <button className="btn btn-soft btn-sm" onClick={unpair}>Separate</button>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <button className="row" onClick={() => setMergeOpen((v) => !v)} aria-expanded={mergeOpen} style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}>
                <Icon name="repeat" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Merge with another habit</div>
                  <div className="muted" style={{ fontSize: "var(--t-sub)" }}>Make two into one, or keep both and tick them together</div></div>
              </button>
              {mergeOpen && (() => {
                const other = others.find((o) => o.id === mergeInto);
                const choice = (v: typeof mergeHow, title: React.ReactNode, sub: string) => (
                  <button role="radio" aria-checked={mergeHow === v} onClick={() => setMergeHow(v)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 16, border: 0, textAlign: "left", width: "100%", background: mergeHow === v ? "var(--soft)" : "var(--surface)", boxShadow: mergeHow === v ? "inset 0 0 0 2px var(--primary)" : "var(--shadow)" }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{mergeHow === v && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--primary)" }} />}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: "var(--t-title)", fontWeight: 800 }}>{title}</span><span className="muted" style={{ display: "block", fontSize: "var(--t-sub)", marginTop: 1, lineHeight: 1.35 }}>{sub}</span></span>
                  </button>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 14px" }}>
                    <label className="field" style={{ minHeight: 44 }}>
                      <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Which habit"
                        style={{ border: 0, background: "none", width: "100%", fontSize: 16, fontWeight: 700, outline: 0, color: "var(--ink)" }}>
                        <option value="">Which habit?</option>
                        {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </label>
                    {other && (
                      <div role="radiogroup" aria-label="What should happen" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {choice("this", <>Keep {habit.name}</>, `${other.name} disappears. All its ticks move to ${habit.name}.`)}
                        {choice("other", <>Keep {other.name}</>, `${habit.name} disappears. All its ticks move to ${other.name}.`)}
                        {choice("both", "Keep both, tick them together", "Ticking one ticks the other. Each keeps its own name, schedule and history.")}
                        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-end", marginTop: 2 }} onClick={merge}>{mergeHow === "both" ? "Tick them together" : `Merge into ${mergeHow === "this" ? habit.name : other.name}`}</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <button className="row" onClick={remove} style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}>
            <Icon name="trash" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Delete habit</div>
              <div className="muted" style={{ fontSize: "var(--t-sub)" }}>Removes its history. Can't be undone.</div></div>
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div className="form-foot">
        {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={save}><Icon name="check" stroke={2.4} />{busy ? "Saving…" : habit ? "Save changes" : "Save habit"}</button>
      </div>
    </main>
  );
}
