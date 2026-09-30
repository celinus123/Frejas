"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { frequencyLabel } from "@/lib/dates";
import type { Frequency, Habit } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Switch } from "./ui";

const FREQS: { v: Frequency; l: string }[] = [
  { v: "daily", l: "Daily" }, { v: "specific_days", l: "Specific days" }, { v: "times_per_week", l: "Times a week" },
  { v: "every_other_week", l: "Every other week" }, { v: "monthly", l: "Monthly" },
];
const CATS = ["Health", "Mind", "Fitness", "Home"];
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
  const [shared, setShared] = useState(habit ? habit.visibility === "friends" : !(profile?.new_habits_private ?? true));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim().length > 0 && (freq !== "specific_days" || days.length > 0);

  async function save() {
    if (!userId || !valid) return;
    setBusy(true); setErr(null);
    const row = {
      name: name.trim(), frequency: freq,
      days: freq === "specific_days" ? [...days].sort() : null,
      times_per_week: freq === "times_per_week" ? times : null,
      category, visibility: shared ? "friends" : "private",
    };
    const q = habit
      ? supabase().from("habits").update(row).eq("id", habit.id)
      : supabase().from("habits").insert({ ...row, owner_id: userId });
    const { error } = await q;
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace(habit ? `/habits/${habit.id}` : "/");
  }

  async function archive() {
    if (!habit) return;
    await supabase().from("habits").update({ archived_at: habit.archived_at ? null : new Date().toISOString() }).eq("id", habit.id);
    toast({ text: habit.archived_at ? "Habit restored." : "Habit archived. Your history is kept." });
    router.replace("/");
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
    <main className="page" style={{ gap: 12, paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
        <button onClick={() => router.back()} style={{ border: 0, background: "none", fontSize: 15, fontWeight: 600, color: "var(--ink-2)", height: 44 }}>Cancel</button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{habit ? "Edit habit" : "New habit"}</div>
        <button onClick={save} disabled={!valid || busy} style={{ border: 0, background: "none", fontSize: 15, fontWeight: 800, color: "var(--primary)", height: 44, opacity: valid ? 1 : 0.4 }}>{busy ? "Saving" : "Save"}</button>
      </div>

      <label className="field"><input autoFocus={!habit} maxLength={60} placeholder="e.g. Read 20 minutes" value={name} onChange={(e) => setName(e.target.value)} aria-label="Habit name" /></label>
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
          <button aria-label="Fewer" onClick={() => setTimes((x) => Math.max(1, x - 1))} style={{ width: 40, height: 40, borderRadius: "50%", border: 0, background: "var(--soft-l)" }}><Icon name="minus" /></button>
          <div style={{ flex: 1, textAlign: "center" }}><span className="font-display" style={{ fontSize: 30, fontWeight: 600 }}>{times}</span><span className="muted" style={{ fontSize: 14 }}> times a week</span></div>
          <button aria-label="More" onClick={() => setTimes((x) => Math.min(7, x + 1))} style={{ width: 40, height: 40, borderRadius: "50%", border: 0, background: "var(--soft-l)" }}><Icon name="plus" /></button>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12.5, padding: "0 4px", lineHeight: 1.4 }}>
        Shows as <b style={{ color: "var(--ink)" }}>{frequencyLabel({ frequency: freq, days, times_per_week: times })}</b>
        {["times_per_week", "every_other_week", "monthly"].includes(freq) && " · any day you like, under This week on Today"}
      </div>

      <div className="label">Category <span style={{ fontWeight: 600 }}>· optional</span></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CATS.map((c) => <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</button>)}
      </div>

      <div className="label">Who can see it</div>
      <div className="card group">
        <div className="row">
          <Icon name={shared ? "users" : "lock"} color="var(--primary)" />
          <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{shared ? "Friends" : "Private"}</div>
            <div className="muted" style={{ fontSize: 12 }}>{shared ? "People in your challenges can see your check-ins" : "Only you"}</div></div>
          <Switch on={shared} onChange={setShared} label="Visible to friends" />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, padding: "0 4px" }}>Reminders are coming in a later version.</div>

      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}

      {habit && (
        <div className="card group" style={{ marginTop: 10 }}>
          <button className="row" onClick={archive} style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}>
            <Icon name="archive" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{habit.archived_at ? "Restore habit" : "Archive habit"}</div>
              <div className="muted" style={{ fontSize: 12 }}>Hide it from Today, keep your history</div></div>
          </button>
          <button className="row" onClick={remove} style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}>
            <Icon name="trash" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Delete habit</div>
              <div className="muted" style={{ fontSize: 12 }}>Removes its history. Can't be undone.</div></div>
          </button>
        </div>
      )}
    </main>
  );
}
