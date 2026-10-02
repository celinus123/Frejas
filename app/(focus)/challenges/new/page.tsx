"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Avatar, Sheet } from "@/components/ui";
import { Cover, PRESETS } from "@/components/Cover";
import { supabase } from "@/lib/supabase";
import { addDays, formatShort, iso, parse, startOfWeek, today } from "@/lib/dates";
import { alignHabitStart, backfillCheckins, loadHabits, myFriends } from "@/lib/data";
import { bestMatch } from "@/lib/similar";
import { uploadCover } from "@/lib/photos";
import { MAX_CHOICES, planWeeks, scheduleLabel } from "@/lib/scoring";
import { STAKE_EMOJIS, STAKE_MAX, joinStake, stakeParts } from "@/lib/stake";
import type { Challenge, CoverPreset, Habit } from "@/lib/types";

type Freq = "daily" | "specific_days" | "times_per_week";
type Unit = string; // "" = just done; "min", "km", "steps", or a unit of your own ("pages", "reps")
type Dur = "2w" | "1m" | "2m" | "custom";
type Win = Challenge["win_rule"];

const UNITS: { v: Unit; l: string }[] = [{ v: "", l: "Just done" }, { v: "min", l: "Minutes" }, { v: "km", l: "km" }, { v: "steps", l: "Steps" }];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function addMonths(s: string, n: number) {
  const d = parse(s);
  const target = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  return iso(new Date(target.getFullYear(), target.getMonth(), target.getDate() - 1));
}
function endFor(start: string, dur: Dur, custom: string) {
  if (dur === "2w") return addDays(start, 13);
  if (dur === "1m") return addMonths(start, 1);
  if (dur === "2m") return addMonths(start, 2);
  return custom < start ? start : custom;
}
function nextMonday(t: string) { return addDays(startOfWeek(t), 7); }
function firstOfNextMonth(t: string) { const d = parse(t); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 1)); }

function Stepper({ value, set, min, max, unit, step = 1 }: { value: number; set: (n: number) => void; min: number; max: number; unit: string; step?: number }) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 16 }}>
      <button aria-label="Fewer" onClick={() => set(Math.max(min, value - step))} style={{ width: 38, height: 38, borderRadius: "50%", border: 0, background: "var(--soft-l)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="minus" /></button>
      <div style={{ flex: 1, textAlign: "center" }}><span className="font-display" style={{ fontSize: 28, fontWeight: 600 }}>{value.toLocaleString("en-GB")}</span><span className="muted" style={{ fontSize: 14 }}> {unit}</span></div>
      <button aria-label="More" onClick={() => set(Math.min(max, value + step))} style={{ width: 38, height: 38, borderRadius: "50%", border: 0, background: "var(--soft-l)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" /></button>
    </div>
  );
}

function Choice({ icon, title, sub, on, onClick }: { icon: string; title: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ flex: 1, padding: 14, borderRadius: 20, border: 0, textAlign: "left", background: on ? "var(--soft)" : "var(--surface)", boxShadow: on ? "inset 0 0 0 2px var(--primary)" : "var(--shadow)", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ width: 38, height: 38, borderRadius: 13, background: on ? "var(--surface)" : "var(--soft-l)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} /></span>
      <span style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>{title}</span>
      <span className="muted" style={{ fontSize: "var(--t-sub)", lineHeight: 1.35 }}>{sub}</span>
    </button>
  );
}

function Radio({ title, sub, on, onClick, tag }: { title: string; sub: string; on: boolean; onClick: () => void; tag?: string }) {
  return (
    <button onClick={onClick} role="radio" aria-checked={on} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, border: 0, textAlign: "left", width: "100%", background: on ? "var(--soft)" : "var(--surface)", boxShadow: on ? "inset 0 0 0 2px var(--primary)" : "var(--shadow)" }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)" }} />}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 800 }}>{title}{tag && <span className="tag" style={{ background: "var(--surface)", fontWeight: 800 }}>{tag}</span>}</span>
        <span className="muted" style={{ display: "block", fontSize: "var(--t-sub)", marginTop: 2 }}>{sub}</span>
      </span>
    </button>
  );
}

function NewChallenge() {
  const router = useRouter();
  const params = useSearchParams();
  const draftId = params.get("draft");
  const { userId, toast } = useApp();
  const t = today();

  const [step, setStep] = useState(1);
  const [id, setId] = useState<string | null>(draftId);
  const [name, setName] = useState("");
  const [solo, setSolo] = useState(true);
  const [preset, setPreset] = useState<CoverPreset>("arches");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [freq, setFreq] = useState<Freq>("times_per_week");
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [times, setTimes] = useState(3);
  const [unit, setUnit] = useState<Unit>("");
  const [minAmount, setMinAmount] = useState(30);
  const [start, setStart] = useState(t);
  const [dur, setDur] = useState<Dur>("1m");
  const [customEnd, setCustomEnd] = useState(addDays(t, 27));
  const [sameGoal, setSameGoal] = useState(true);
  const [win, setWin] = useState<Win>("finishers");
  const [stake, setStake] = useState("");
  const [stakeEmoji, setStakeEmoji] = useState<string | null>(null);   // the icon shown with the stake; null = the coffee cup
  const [unitEdit, setUnitEdit] = useState(false);
  const [unitDraft, setUnitDraft] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const [friends, setFriends] = useState<{ id: string; display_name: string; avatar_path: string | null; shared: number }[]>([]);
  const [invitees, setInvitees] = useState<Set<string>>(new Set());
  const [joinMode, setJoinMode] = useState<"approve" | "open">("approve");
  // last day to join: "auto" = the start day, but never less than three days from now
  const [joinPick, setJoinPick] = useState<"auto" | "start" | "soon" | "any" | "date">("auto");
  const [joinDate, setJoinDate] = useState("");
  const [findable, setFindable] = useState(false);              // can all your friends find it and ask to join?
  const [maxPeople, setMaxPeople] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [myHabits, setMyHabits] = useState<Habit[]>([]);
  const [linkTo, setLinkTo] = useState<string | null>(null);   // an existing habit it counts on; null = make a new one
  const [linkTouched, setLinkTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : null), [coverFile]);

  const end = endFor(start, dur, customEnd);
  const soon = addDays(t, 3) > end ? end : addDays(t, 3);
  const autoPick: "start" | "soon" = start >= soon ? "start" : "soon";
  const joinKind = joinPick === "auto" ? autoPick : joinPick;
  const joinRaw = joinKind === "any" ? null : joinKind === "start" ? start : joinKind === "soon" ? soon : joinDate || soon;
  const joinBy = joinRaw && joinRaw > end ? end : joinRaw;
  const total = solo ? 2 : 4;

  useEffect(() => { if (userId) myFriends(userId).then(setFriends).catch(() => {}); }, [userId]);
  useEffect(() => { if (userId) loadHabits(userId).then(setMyHabits).catch(() => {}); }, [userId]);
  // suggest an existing habit with a similar name, until you choose yourself
  useEffect(() => { if (!linkTouched) setLinkTo(bestMatch(name, myHabits)?.id ?? null); }, [name, myHabits, linkTouched]);

  // continue a draft
  useEffect(() => {
    if (!draftId) return;
    supabase().from("challenges").select("*").eq("id", draftId).single().then(({ data }) => {
      const c = data as Challenge | null;
      if (!c) return;
      setName(c.name); setSolo(c.solo); setPreset(c.cover_preset ?? "arches"); setCoverPath(c.cover_path);
      if (c.frequency) setFreq(c.frequency);
      if (c.days) setDays(c.days); if (c.times_per_week) setTimes(c.times_per_week);
      const u = (c.unit ?? "") as Unit; setUnit(u); if (c.min_amount) setMinAmount(c.min_amount);
      setStart(c.starts_on < t ? t : c.starts_on); setDur("custom"); setCustomEnd(c.ends_on);
      setSameGoal(c.same_goal); setWin(c.win_rule); setStake(stakeParts(c.stake).text); setStakeEmoji(stakeParts(c.stake).emoji); setJoinMode(c.join_mode);
      if (c.join_by) { setJoinPick("date"); setJoinDate(c.join_by); } else if (!c.solo && c.join_by === null) setJoinPick("any");
      setFindable(c.visibility === "friends"); setMaxPeople(c.max_members ?? null);
    });
  }, [draftId, t]);

  const fields = () => ({
    name: name.trim() || "Untitled challenge", solo, goal_type: "own" as const, unit: unit || null,
    frequency: freq, days: freq === "specific_days" ? [...days].sort() : null, times_per_week: freq === "times_per_week" ? times : null,
    min_amount: unit ? minAmount : null, starts_on: start, ends_on: end, same_goal: sameGoal, win_rule: solo ? "finishers" : win,
    stake: solo ? null : joinStake(stakeEmoji, stake) || null, join_mode: joinMode, cover_preset: preset,
    ...(solo ? {} : { join_by: joinBy, visibility: findable ? "friends" : "invite", max_members: maxPeople, ...(findable ? { join_mode: "approve" as const } : {}) }),
  });

  async function saveRow(status: "draft" | "active"): Promise<string> {
    const row = { ...fields(), status };
    let cid = id;
    if (cid) {
      const { error } = await supabase().from("challenges").update(row).eq("id", cid);
      if (error) throw error;
    } else {
      const { data, error } = await supabase().from("challenges").insert({ ...row, creator_id: userId }).select("id").single();
      if (error) throw error;
      cid = data.id as string; setId(cid);
    }
    if (coverFile) {
      const p = await uploadCover(coverFile, cid!);
      await supabase().from("challenges").update({ cover_path: p }).eq("id", cid!);
      setCoverPath(p); setCoverFile(null);
    }
    return cid!;
  }

  async function saveDraft() {
    if (!userId) return;
    setBusy(true); setErr(null);
    try { await saveRow("draft"); toast({ text: "Saved as a draft. Find it under Challenges." }); router.replace("/challenges"); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  async function create() {
    if (!userId) return;
    setBusy(true); setErr(null);
    try {
      const cid = await saveRow("active");
      let habit: { id: string };
      if (linkTo) habit = { id: linkTo };
      else {
        const { data, error: he } = await supabase().from("habits").insert({
          owner_id: userId, name: name.trim().slice(0, 60), frequency: freq,
          days: freq === "specific_days" ? [...days].sort() : null, times_per_week: freq === "times_per_week" ? times : null,
          starts_on: start !== t ? start : null, from_challenge: cid,
        }).select("id").single();
        if (he) throw he;
        habit = data;
      }
      // started earlier: the habit covers those days too, and ticks already made in that time count
      if (linkTo && start < t) await alignHabitStart(linkTo, start);
      const { error: me } = await supabase().from("challenge_members").insert({
        challenge_id: cid, user_id: userId, habit_id: habit.id, goal_amount: unit ? minAmount : null, times_per_week: freq === "times_per_week" ? times : null,
      });
      if (me && me.code !== "23505") throw me;
      if (linkTo) await backfillCheckins({ id: cid, starts_on: start, ends_on: end, unit: unit || null }, linkTo, userId).catch(() => 0);
      if (!solo && invitees.size) {
        await supabase().from("challenge_invites").insert([...invitees].map((u) => ({ challenge_id: cid, user_id: u, invited_by: userId })));
      }
      router.replace(`/challenges/${cid}${solo ? "" : "?created=1"}`);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  const sessions = useMemo(() => {
    const fake = { ...fields(), frequency: freq, same_goal: true } as unknown as Challenge;
    return planWeeks(fake).reduce((a, w) => a + w.target, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, days, times, start, end]);
  const weeks = Math.ceil((parse(end).getTime() - parse(start).getTime()) / 86400000 / 7);
  const schedule = scheduleLabel({ frequency: freq, days, times_per_week: times, min_amount: unit ? minAmount : null, unit: unit || null });

  const header = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
        {step === 1 ? <button onClick={() => router.back()} style={{ border: 0, background: "none", fontSize: 15, fontWeight: 600, color: "var(--ink-2)", height: 44 }}>Cancel</button>
          : <button className="icon-btn" aria-label="Back" onClick={() => { setErr(null); setStep(step - 1); }}><Icon name="left" /></button>}
        <button onClick={saveDraft} disabled={busy} style={{ border: 0, background: "none", fontSize: 14, fontWeight: 800, color: "var(--primary)", height: 44 }}>Save draft</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", gap: 6 }}>{Array.from({ length: total }, (_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < step ? "var(--primary)" : "var(--soft)" }} />)}</div>
        <span className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>{step} of {total}</span>
      </div>
    </>
  );
  const q = (text: string) => <h1 className="h1" style={{ fontSize: 22, marginTop: 4 }}>{text}</h1>;
  const errBox = err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>;

  if (step === 1) return (
    <main className="page" style={{ gap: 10, paddingBottom: 40 }}>
      {header}
      {q("New challenge")}
      <label style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 18px", borderRadius: 20, background: "var(--surface)", boxShadow: "inset 0 0 0 2px var(--primary)" }}>
        <span className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 800 }}>Name your challenge</span>
        <input ref={nameRef} autoFocus={!draftId} maxLength={60} placeholder="e.g. Pilates body" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} aria-label="Challenge name"
          className="font-display" style={{ border: 0, outline: 0, background: "none", fontSize: 26, fontWeight: 600, padding: 0, width: "100%" }} />
      </label>
      <div className="label">Who is it for?</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Choice icon="user" title="Just me" sub="A personal goal. You can invite friends later." on={solo} onClick={() => setSolo(true)} />
        <Choice icon="users" title="With friends" sub="Do it together. You'll invite them in the last step." on={!solo} onClick={() => setSolo(false)} />
      </div>
      <div className="label" style={{ display: "flex", justifyContent: "space-between" }}>Cover image<span style={{ fontWeight: 600 }}>Optional</span></div>
      <button onClick={() => setCoverOpen(true)} style={{ position: "relative", border: 0, padding: 0, borderRadius: 24, overflow: "hidden", display: "block", width: "100%" }}>
        <Cover preset={preset} path={coverFile ? null : coverPath} src={preview} height={120} />
        <span style={{ position: "absolute", right: 10, bottom: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, background: "var(--surface)", fontSize: 12.5, fontWeight: 800, boxShadow: "var(--shadow)" }}><Icon name="camera" size={15} />Change</span>
      </button>
      {errBox}
      <div style={{ flex: 1 }} />
      <button className="btn btn-primary" onClick={() => { if (!name.trim()) { setErr("Give your challenge a name first."); nameRef.current?.focus(); return; } setErr(null); setStep(2); }} style={{ marginTop: 10 }}>Next</button>

      <Sheet open={coverOpen} onClose={() => setCoverOpen(false)} label="Cover image">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="h1" style={{ fontSize: 22 }}>Cover image</div>
          <button className="icon-btn" aria-label="Close" onClick={() => setCoverOpen(false)}><Icon name="x" /></button>
        </div>
        <button onClick={() => fileRef.current?.click()} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: 0, textAlign: "left" }}>
          <span style={{ width: 44, height: 44, borderRadius: 15, background: "var(--soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="camera" size={22} /></span>
          <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: "var(--t-title)", fontWeight: 800 }}>Upload a photo</span><span className="muted" style={{ display: "block", fontSize: "var(--t-sub)" }}>From your camera or library</span></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCoverFile(f); setCoverOpen(false); } }} />
        <div className="label">Or pick one</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {PRESETS.map((p) => {
            const on = p === preset && !coverFile && !coverPath;
            return (
              <button key={p} aria-label={`Cover ${p}`} aria-pressed={on} onClick={() => { setPreset(p); setCoverFile(null); setCoverPath(null); setCoverOpen(false); }}
                style={{ position: "relative", border: 0, padding: 0, borderRadius: 16, overflow: "hidden", boxShadow: on ? "0 0 0 3px var(--primary)" : "none" }}>
                <Cover preset={p} height={86} />
                {on && <span style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={12} stroke={2.8} /></span>}
              </button>
            );
          })}
        </div>
      </Sheet>
    </main>
  );

  if (step === 2) {
    const startOpts = [{ v: t, l: "Today" }, { v: nextMonday(t), l: "Next Monday" }, { v: firstOfNextMonth(t), l: formatShort(firstOfNextMonth(t)) }];
    const ownUnit = !!unit && !UNITS.some((u) => u.v === unit);
    const ready = () => {
      if (freq === "specific_days" && !days.length) { setErr("Pick at least one day."); return false; }
      if (end < t) return false;
      setErr(null); return true;
    };
    const saveUnit = () => { const u = unitDraft.trim().toLowerCase().slice(0, 16); setUnitEdit(false); setUnitDraft(""); if (u) { setUnit(u); setMinAmount(10); } };
    const custom = !startOpts.some((o) => o.v === start);
    return (
      <main className="page" style={{ gap: 10, paddingBottom: 40 }}>
        {header}
        {q("What's the goal?")}
        <div className="label">How often</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([["daily", "Every day"], ["specific_days", "Specific days"], ["times_per_week", "Times a week"]] as [Freq, string][]).map(([v, l]) =>
            <button key={v} className="chip" aria-pressed={freq === v} onClick={() => setFreq(v)}>{l}</button>)}
        </div>
        {freq === "times_per_week" && <Stepper value={times} set={setTimes} min={1} max={7} unit={times === 1 ? "time a week" : "times a week"} />}
        {freq === "specific_days" && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {"MTWTFSS".split("").map((l, i) => {
              const n = i + 1, on = days.includes(n);
              return <button key={n} aria-label={DAY_NAMES[i]} aria-pressed={on} onClick={() => setDays((d) => on ? d.filter((x) => x !== n) : [...d, n])}
                style={{ width: 40, height: 40, borderRadius: "50%", border: 0, textAlign: "center", fontSize: 13, fontWeight: 800, background: on ? "var(--primary)" : "var(--surface)", color: on ? "var(--on-primary)" : "var(--ink)", boxShadow: on ? "none" : "var(--shadow)" }}>{l}</button>;
            })}
          </div>
        )}

        <div className="label" style={{ display: "flex", justifyContent: "space-between" }}>What counts<span style={{ fontWeight: 600 }}>Optional</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {UNITS.map((u) => <button key={u.v} className="chip" aria-pressed={unit === u.v} onClick={() => { setUnit(u.v); setMinAmount(u.v === "steps" ? 10000 : u.v === "km" ? 5 : 30); }}>{u.l}</button>)}
          {/* your own unit, e.g. pages or reps */}
          {unitEdit ? (
            <label className="chip" style={{ paddingRight: 6 }}>
              <input autoFocus maxLength={16} value={unitDraft} placeholder="e.g. pages" aria-label="Your own unit" onChange={(e) => setUnitDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveUnit(); if (e.key === "Escape") { setUnitEdit(false); setUnitDraft(""); } }} onBlur={saveUnit}
                style={{ border: 0, outline: 0, background: "none", width: 110, fontWeight: 700 }} />
            </label>
          ) : ownUnit ? <button className="chip" aria-pressed onClick={() => { setUnitDraft(unit); setUnitEdit(true); }}>{unit}</button>
            : <button className="chip" onClick={() => setUnitEdit(true)} style={{ color: "var(--ink-2)" }}><Icon name="plus" size={15} stroke={2.2} />Custom</button>}
        </div>
        {unit && <Stepper value={minAmount} set={setMinAmount} min={1} max={unit === "steps" ? 50000 : ownUnit ? 10000 : 600} step={unit === "steps" ? 1000 : unit === "min" ? 5 : 1} unit={`${unit} or more`} />}

        <div className="label">Starts</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {startOpts.map((o) => <button key={o.l} className="chip" aria-pressed={start === o.v} onClick={() => setStart(o.v)}>{o.l}</button>)}
          <label className="chip" aria-pressed={custom} style={{ position: "relative", cursor: "pointer" }}>
            <Icon name="calendar" size={15} />{custom ? formatShort(start) : "Pick a date"}
            <input type="date" min={addDays(t, -365)} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} aria-label="Start date"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
          </label>
        </div>

        {start < t && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>
          It already started, so the days since {formatShort(start)} count. {linkTo && !unit ? "Days you've ticked on the habit are checked in for you." : "Check in for them from the challenge's week view."}</div>}
        <div className="label">For how long</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([["2w", "2 weeks"], ["1m", "1 month"], ["2m", "2 months"]] as [Dur, string][]).map(([v, l]) => <button key={v} className="chip" aria-pressed={dur === v} onClick={() => setDur(v)}>{l}</button>)}
          <label className="chip" aria-pressed={dur === "custom"} style={{ position: "relative", cursor: "pointer" }}>
            <Icon name="calendar" size={15} />{dur === "custom" ? `Until ${formatShort(end)}` : "Pick a date"}
            <input type="date" min={start} value={end} onChange={(e) => { if (e.target.value) { setCustomEnd(e.target.value); setDur("custom"); } }} aria-label="End date"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
          </label>
        </div>

        <div className="soft" style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 24 }}>
          <span style={{ width: 40, height: 40, borderRadius: 14, background: "var(--surface)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="trophy" /></span>
          <div>
            <div style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>{name.trim() || "Your challenge"} · {schedule}</div>
            <div className="muted" style={{ fontSize: "var(--t-sub)", marginTop: 2 }}>
              {start === t ? "Starts today" : `${start < t ? "Started" : "Starts"} ${parse(start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`} · {sessions} sessions over {weeks} weeks
              {freq === "times_per_week" && ". Extra sessions count as bonus."}
            </div>
          </div>
        </div>
        {myHabits.length > 0 && (
          <>
            <div className="label">{solo ? "Counts on" : <>Your own habit <span style={{ fontWeight: 600 }}>· only for you</span></>}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="chip" aria-pressed={!linkTo} onClick={() => { setLinkTo(null); setLinkTouched(true); }}>New habit</button>
              {(() => {
                const sug = bestMatch(name, myHabits);
                const picked = myHabits.find((h) => h.id === linkTo);
                const show = [sug, picked && picked.id !== sug?.id ? picked : null].filter((h): h is Habit => !!h);
                return show.map((h) => <button key={h.id} className="chip" aria-pressed={linkTo === h.id} onClick={() => { setLinkTo(h.id); setLinkTouched(true); }}>{h.name}</button>);
              })()}
              <label className="chip" style={{ position: "relative", color: "var(--ink-2)" }}>
                Link a habit…
                <select value="" onChange={(e) => { if (e.target.value) { setLinkTo(e.target.value); setLinkTouched(true); } }} aria-label="Pick one of your habits"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
                  <option value="">Pick a habit</option>
                  {myHabits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
            </div>
            <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>
              {linkTo ? <>Ticking <b style={{ color: "var(--ink)" }}>{myHabits.find((h) => h.id === linkTo)?.name}</b> on Today checks you in here. It keeps going after the challenge ends.</>
                : "A new habit shows up on Today while the challenge runs. When it ends, you choose whether to keep it."}
              {!solo && " This is about your own Today. Friends pick their own habit when they join."}
            </div>
          </>
        )}
        {end < t && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>With that start date it would already be over. Pick a later end.</div>}
        {errBox}
        <div style={{ flex: 1 }} />
        {solo ? <button className="btn btn-primary" disabled={busy} onClick={() => ready() && create()} style={{ marginTop: 10 }}><Icon name="check" stroke={2.4} />{busy ? "Creating…" : "Create challenge"}</button>
          : <button className="btn btn-primary" onClick={() => ready() && setStep(3)} style={{ marginTop: 10 }}>Next</button>}
      </main>
    );
  }

  if (step === 3) return (
    <main className="page" style={{ gap: 10, paddingBottom: 40 }}>
      {header}
      {q("Doing it together")}
      <div className="label">Goal for everyone</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Choice icon="users" title="Same goal" sub={`Everyone: ${schedule}`} on={sameGoal} onClick={() => setSameGoal(true)} />
        <Choice icon="user" title="Own goals" sub={`Each person picks ${freq === "times_per_week" ? "how often" : unit ? "how much" : "their own"}${freq === "times_per_week" && unit ? " and how much" : ""}. Dates and rules stay the same.`} on={!sameGoal} onClick={() => setSameGoal(false)} />
      </div>
      <div className="label">Who wins?</div>
      <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Radio title="Everyone who makes it" sub="Reach 80% of the goal and you're a winner. No losers." on={win === "finishers"} onClick={() => setWin("finishers")} tag="Recommended" />
        <Radio title="Most consistent" sub="Highest % of the goal wins." on={win === "consistent"} onClick={() => setWin("consistent")} />
        <Radio title="Most sessions" sub={unit ? `Whoever logs the most ${unit}, wins.` : "Whoever does the most, wins."} on={win === "most"} onClick={() => setWin("most")} />
      </div>
      <div className="label" style={{ display: "flex", justifyContent: "space-between" }}>What's at stake<span style={{ fontWeight: 600 }}>Optional</span></div>
      <label className="field">{stakeEmoji ? <span className="em" aria-hidden="true" style={{ fontSize: 18, width: 20, textAlign: "center" }}>{stakeEmoji}</span> : <Icon name="coffee" color="var(--accent)" />}
        <input maxLength={STAKE_MAX} placeholder={win === "finishers" ? "e.g. Finishers get brunch" : "e.g. Loser buys coffee"} value={stake} aria-label="Stake"
          onChange={(e) => { const p = stakeParts(e.target.value); if (p.emoji) { setStakeEmoji(p.emoji); setStake(p.text); } else setStake(e.target.value); }} /></label>
      {/* the icon shown next to the stake: the cup, one of these, or any emoji typed first in the box */}
      <div role="group" aria-label="Icon for the stake" className="no-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -20px", padding: "2px 20px 4px" }}>
        <button className="chip" aria-pressed={!stakeEmoji} aria-label="Coffee cup" onClick={() => setStakeEmoji(null)} style={{ width: 40, padding: 0, justifyContent: "center" }}><Icon name="coffee" size={17} /></button>
        {STAKE_EMOJIS.map((e) => <button key={e} className="chip" aria-pressed={stakeEmoji === e} aria-label={`Icon ${e}`} onClick={() => setStakeEmoji(e)} style={{ width: 40, padding: 0, justifyContent: "center" }}><span className="em" style={{ fontSize: 17 }}>{e}</span></button>)}
        {stakeEmoji && !(STAKE_EMOJIS as readonly string[]).includes(stakeEmoji) && <button className="chip" aria-pressed style={{ width: 40, padding: 0, justifyContent: "center" }}><span className="em" style={{ fontSize: 17 }}>{stakeEmoji}</span></button>}
      </div>
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>Pick an icon, or type any emoji first in the box.</div>
      <div style={{ flex: 1 }} />
      <button className="btn btn-primary" onClick={() => setStep(4)} style={{ marginTop: 10 }}>Next</button>
    </main>
  );

  return (
    <main className="page" style={{ gap: 10, paddingBottom: 40 }}>
      {header}
      {q("Invite friends")}
      <div className="label" style={{ display: "flex", justifyContent: "space-between" }}>Friends on Frejas<span style={{ fontWeight: 600 }}>{invitees.size} selected</span></div>
      {friends.length ? (
        <div className="card group">
          {friends.map((f) => {
            const on = invitees.has(f.id);
            return (
              <button key={f.id} role="checkbox" aria-checked={on} onClick={() => setInvitees((s) => { const n = new Set(s); if (on) n.delete(f.id); else n.add(f.id); return n; })}
                className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}>
                <Avatar name={f.display_name} path={f.avatar_path} size={38} />
                <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{f.display_name}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{f.shared} challenge{f.shared > 1 ? "s" : ""} together</div></div>
                <span style={{ width: 28, height: 28, borderRadius: 9, border: on ? 0 : "2px solid var(--primary)", background: on ? "var(--primary)" : "none", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{on && <Icon name="check" size={16} stroke={2.6} />}</span>
              </button>
            );
          })}
        </div>
      ) : <div className="muted" style={{ fontSize: 13.5, padding: "0 4px" }}>No friends on Frejas yet. You get a link to share as soon as the challenge is created.</div>}
      {friends.length > 0 && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>Friends you tick get the invitation inside Frejas, under Challenges, and join with one tap. No link needed.</div>}
      <div className="label">Who else can find it</div>
      <div role="radiogroup" aria-label="Who else can find it" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Radio title="Only people I invite" sub="Nobody else sees that it exists." on={!findable} onClick={() => setFindable(false)} />
        <Radio title="All my friends" sub="They see it under Challenges and can ask to join. You say yes to each one." on={findable} onClick={() => { setFindable(true); if (maxPeople === null) setMaxPeople(20); }} />
      </div>

      <div className="label">People who get the link</div>
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>You also get a link to send to anyone who isn&apos;t your friend on Frejas yet.</div>
      {findable ? <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>Because your friends can find it, everyone who isn&apos;t invited asks first, with the link too.</div> : (
      <div role="radiogroup" aria-label="People who get the link" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Radio title="Only people I approve" sub="Anyone else who opens the link asks to join, and you say yes." on={joinMode === "approve"} onClick={() => setJoinMode("approve")} />
        <Radio title="Anyone with the link" sub="Good for bigger groups, like a gym or a class." on={joinMode === "open"} onClick={() => setJoinMode("open")} />
      </div>)}

      <div className="label">How many can join</div>
      <div role="group" aria-label="How many can join" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="chip" aria-pressed={maxPeople === null} onClick={() => setMaxPeople(null)}>No limit</button>
        {MAX_CHOICES.map((n) => <button key={n} className="chip" aria-pressed={maxPeople === n} onClick={() => setMaxPeople(n)}>{n} people</button>)}
      </div>
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>
        {maxPeople ? `You count as one. People waiting for your answer take up a place too, so you never get more requests than there is room for.` : "Anyone who is let in can join."}
      </div>
      <div className="label">Last day to join</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {start > t && <button className="chip" aria-pressed={joinKind === "start"} onClick={() => setJoinPick("start")}>Until it starts</button>}
        <button className="chip" aria-pressed={joinKind === "soon"} onClick={() => setJoinPick("soon")}>{formatShort(soon)}</button>
        <button className="chip" aria-pressed={joinKind === "any"} onClick={() => setJoinPick("any")}>Any time</button>
        <label className="chip" aria-pressed={joinKind === "date"} style={{ position: "relative", cursor: "pointer" }}>
          <Icon name="calendar" size={15} />{joinKind === "date" && joinDate ? formatShort(joinDate > end ? end : joinDate) : "Pick a date"}
          <input type="date" min={t} max={end} value={joinDate || soon} onChange={(e) => { if (e.target.value) { setJoinDate(e.target.value); setJoinPick("date"); } }} aria-label="Last day to join"
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
        </label>
      </div>
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>
        {joinBy ? <>Friends can join until <b style={{ color: "var(--ink)" }}>{parse(joinBy).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</b>. After that nobody new gets in.</> : "Friends can join for as long as the challenge runs."} You can change this later in the challenge&apos;s menu.
      </div>
      {errBox}
      <div style={{ flex: 1 }} />
      <button className="btn btn-primary" disabled={busy} onClick={create} style={{ marginTop: 10 }}><Icon name="check" stroke={2.4} />{busy ? "Creating…" : invitees.size ? `Create and invite ${invitees.size}` : "Create challenge"}</button>
    </main>
  );
}

export default function Page() {
  return <Suspense><NewChallenge /></Suspense>;
}
