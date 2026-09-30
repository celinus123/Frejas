"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Switch } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { addDays, today } from "@/lib/dates";
import { loadHabits } from "@/lib/data";
import type { Habit } from "@/lib/types";

const UNITS = [{ v: "", l: "Just done" }, { v: "steps", l: "Steps" }, { v: "km", l: "km" }, { v: "min", l: "Minutes" }];
const STAKES = ["Loser buys coffee", "Winner picks the film", "Loser cooks dinner"];

export default function NewChallenge() {
  const router = useRouter();
  const { userId } = useApp();
  const [step, setStep] = useState(1);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [name, setName] = useState("");
  const [habitId, setHabitId] = useState<string>("new");
  const [goalType, setGoalType] = useState<"own" | "shared">("own");
  const [unit, setUnit] = useState("");
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(addDays(today(), 27));
  const [stake, setStake] = useState("");
  const [streakStat, setStreakStat] = useState(true);
  const [checkinStat, setCheckinStat] = useState(true);
  const [photoStat, setPhotoStat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (userId) loadHabits(userId).then(setHabits); }, [userId]);

  const num = (s: string) => Number(s.replace(",", "."));
  const step1Valid = name.trim() && end >= start && end >= today() &&
    (goalType === "own" ? (!unit || num(goal) > 0) : num(target) > 0);

  async function create() {
    if (!userId) return;
    setBusy(true); setErr(null);
    try {
      let hid: string | null = habitId === "new" ? null : habitId;
      if (habitId === "new") {
        const { data, error } = await supabase().from("habits").insert({ owner_id: userId, name: name.trim().slice(0, 60), frequency: "daily" }).select().single();
        if (error) throw error;
        hid = (data as Habit).id;
      }
      const { data: c, error } = await supabase().from("challenges").insert({
        creator_id: userId, name: name.trim(), goal_type: goalType, unit: unit || null,
        shared_target: goalType === "shared" ? num(target) : null, starts_on: start, ends_on: end,
        stake: stake.trim() || null, show_longest_streak: streakStat, show_most_checkins: checkinStat, show_most_photos: photoStat,
      }).select().single();
      if (error) throw error;
      const { error: e2 } = await supabase().from("challenge_members").insert({
        challenge_id: c.id, user_id: userId, habit_id: hid, goal_amount: goalType === "own" ? (unit ? num(goal) : 1) : null,
      });
      if (e2) throw e2;
      router.replace(`/challenges/${c.id}?created=1`);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  const bar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      {step === 1 ? <button onClick={() => router.back()} style={{ border: 0, background: "none", fontSize: 15, fontWeight: 600, color: "var(--ink-2)", height: 44 }}>Cancel</button>
        : <button className="icon-btn" aria-label="Back" onClick={() => setStep(1)}><Icon name="left" /></button>}
      <div style={{ fontSize: 16, fontWeight: 800 }}>New challenge</div>
      <span className="muted" style={{ fontSize: 13, fontWeight: 700, width: 44, textAlign: "right" }}>{step} of 2</span>
    </div>
  );
  const progress = <div style={{ display: "flex", gap: 6 }}>{[1, 2].map((i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= step ? "var(--primary)" : "var(--soft)" }} />)}</div>;
  const option = (on: boolean, title: string, sub: string, onClick: () => void) => (
    <button onClick={onClick} style={{ flex: 1, padding: 12, borderRadius: 16, border: 0, textAlign: "left", background: on ? "var(--soft)" : "var(--surface)", boxShadow: on ? "inset 0 0 0 2px var(--primary)" : "var(--shadow)", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{title}</span><span className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>{sub}</span>
    </button>
  );

  if (step === 1) return (
    <main className="page" style={{ gap: 10, paddingBottom: 40 }}>
      {bar}{progress}
      <div className="label">Name</div>
      <label className="field"><input autoFocus maxLength={60} placeholder="e.g. Autumn Steps" value={name} onChange={(e) => setName(e.target.value)} aria-label="Challenge name" /></label>

      <div className="label">Habit it tracks</div>
      <label className="field"><Icon name="sun" color="var(--ink-2)" />
        <select value={habitId} onChange={(e) => setHabitId(e.target.value)} aria-label="Habit" style={{ border: 0, background: "none", width: "100%", fontSize: 15, fontWeight: 700, outline: 0 }}>
          <option value="new">New habit: {name.trim() || "same name as the challenge"}</option>
          {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <div className="muted" style={{ fontSize: 12.5, padding: "0 4px", marginTop: -4 }}>Checking it off on Today also checks in here.</div>

      <div className="label">Goal type</div>
      <div style={{ display: "flex", gap: 10 }}>
        {option(goalType === "own", "Own goals", "Everyone sets a goal. Ranked by % of days reached.", () => setGoalType("own"))}
        {option(goalType === "shared", "Shared goal", "Reach one total together.", () => setGoalType("shared"))}
      </div>

      <div className="label">What do you count?</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{UNITS.map((u) => <button key={u.v} className="chip" aria-pressed={unit === u.v} onClick={() => setUnit(u.v)}>{u.l}</button>)}</div>

      {goalType === "own" && unit && (
        <><div className="label">Your goal</div>
          <label className="field"><input inputMode="decimal" placeholder="10000" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^0-9.,]/g, ""))} aria-label="Your daily goal" />
            <span className="muted" style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{unit} per day</span></label></>
      )}
      {goalType === "shared" && (
        <><div className="label">Group target</div>
          <label className="field"><input inputMode="decimal" placeholder="100" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.,]/g, ""))} aria-label="Group target" />
            <span className="muted" style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{unit || "check-ins"} in total</span></label></>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <label className="card" style={{ flex: 1, padding: "10px 14px", borderRadius: 16 }}><div className="muted" style={{ fontSize: 12 }}>Starts</div>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ border: 0, background: "none", fontSize: 15, fontWeight: 800, width: "100%", padding: 0 }} /></label>
        <label className="card" style={{ flex: 1, padding: "10px 14px", borderRadius: 16 }}><div className="muted" style={{ fontSize: 12 }}>Ends</div>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} style={{ border: 0, background: "none", fontSize: 15, fontWeight: 800, width: "100%", padding: 0 }} /></label>
      </div>
      {goalType === "own" && (
        <div className="muted" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, padding: "0 4px" }}><Icon name="lock" size={15} />Goals are visible to everyone and lock when the challenge starts.</div>
      )}
      <button className="btn btn-primary" style={{ marginTop: 6 }} disabled={!step1Valid} onClick={() => setStep(2)}>Next</button>
    </main>
  );

  return (
    <main className="page" style={{ gap: 10, paddingBottom: 40 }}>
      {bar}{progress}
      <div className="label">What's at stake <span style={{ fontWeight: 600 }}>· optional</span></div>
      <label className="field"><Icon name="coffee" color="var(--accent)" /><input maxLength={80} placeholder="e.g. Loser buys coffee" value={stake} onChange={(e) => setStake(e.target.value)} aria-label="Stake" /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{STAKES.map((s) => <button key={s} className="chip" aria-pressed={stake === s} onClick={() => setStake(s)}>{s}</button>)}</div>

      <div className="label">Extra stats to show</div>
      <div className="card group">
        <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Longest streak</div><Switch on={streakStat} onChange={setStreakStat} label="Longest streak" /></div>
        <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Most check-ins</div><Switch on={checkinStat} onChange={setCheckinStat} label="Most check-ins" /></div>
        <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Most photos</div><Switch on={photoStat} onChange={setPhotoStat} label="Most photos" /></div>
      </div>
      <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>You'll get a link to share when it's created.</div>
      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
      <button className="btn btn-primary" style={{ marginTop: 6 }} disabled={busy} onClick={create}><Icon name="check" stroke={2.4} />{busy ? "Creating…" : "Create challenge"}</button>
    </main>
  );
}
