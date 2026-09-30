"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Cover } from "@/components/Cover";
import { FrejasMark, FrejasWordmark } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { Avatars } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { formatShort, today } from "@/lib/dates";
import { loadHabits } from "@/lib/data";
import { bestMatch } from "@/lib/similar";
import { fmt, scheduleLabel, winRuleLabel } from "@/lib/scoring";
import type { Challenge, CoverPreset, Habit } from "@/lib/types";

interface Invite {
  challenge_id: string; name: string; goal_type: "own" | "shared"; unit: string | null; starts_on: string; ends_on: string;
  stake: string | null; member_names: string[];
  frequency: Challenge["frequency"]; days: number[] | null; times_per_week: number | null; min_amount: number | null;
  same_goal: boolean; win_rule: Challenge["win_rule"]; join_mode: Challenge["join_mode"]; cover_preset: CoverPreset | null;
}

export default function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { session, userId, profile } = useApp();
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitId, setHabitId] = useState("new");
  const [goal, setGoal] = useState("");
  const [times, setTimes] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    supabase().rpc("get_invite", { p_token: token }).then(({ data }) => {
      const i = (data as Invite[] | null)?.[0] ?? null;
      setInv(i);
      if (i?.times_per_week) setTimes(i.times_per_week);
      if (i?.min_amount) setGoal(String(i.min_amount));
    });
  }, [token]);

  useEffect(() => {
    if (!userId || !inv) return;
    loadHabits(userId).then((hs) => { setHabits(hs); const m = bestMatch(inv.name, hs); if (m) setHabitId(m.id); });
    supabase().from("challenge_members").select("challenge_id").eq("challenge_id", inv.challenge_id).eq("user_id", userId).maybeSingle()
      .then(({ data }) => { if (data) router.replace(`/challenges/${inv.challenge_id}`); });
    supabase().from("join_requests").select("challenge_id").eq("challenge_id", inv.challenge_id).eq("user_id", userId).maybeSingle()
      .then(({ data }) => { if (data) setRequested(true); });
  }, [userId, inv, router]);

  if (inv === undefined) return <main className="page"><div className="skeleton" style={{ height: 300 }} /></main>;
  if (inv === null) return (
    <main className="page" style={{ paddingTop: 80 }}>
      <div className="card" style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="h1" style={{ fontSize: 24 }}>This link doesn't work</div>
        <p className="muted" style={{ margin: 0 }}>The challenge may have ended, or the link was replaced. Ask your friend for a new one.</p>
        <Link href="/" className="btn btn-soft">Go to Frejas</Link>
      </div>
    </main>
  );

  const v2 = !!inv.frequency;
  const own = v2 ? !inv.same_goal : inv.goal_type === "own";
  const askTimes = v2 && own && inv.frequency === "times_per_week";
  const askAmount = own && !!inv.unit && (v2 ? !!inv.min_amount : true);
  const num = Number(goal.replace(",", "."));
  const approve = inv.join_mode === "approve";
  const unitLabel = inv.unit === "min" ? "minutes" : inv.unit;

  async function join() {
    if (!userId || !inv) return;
    setBusy(true); setErr(null);
    try {
      const pGoal = askAmount ? num : v2 ? null : inv.goal_type === "own" ? 1 : null;
      const pTimes = askTimes ? times : null;
      // Ask first: a habit is only created once you're actually in.
      let hid: string | null = habitId === "new" ? null : habitId;
      if (!approve && habitId === "new") {
        const start = inv.starts_on > today() ? inv.starts_on : null;
        const { data, error } = await supabase().from("habits").insert(v2 ? {
          owner_id: userId, name: inv.name.slice(0, 60), frequency: inv.frequency,
          days: inv.frequency === "specific_days" ? inv.days : null,
          times_per_week: inv.frequency === "times_per_week" ? (pTimes ?? inv.times_per_week) : null,
          starts_on: start, from_challenge: inv.challenge_id,
        } : { owner_id: userId, name: inv.name.slice(0, 60), frequency: "daily", from_challenge: inv.challenge_id }).select("id").single();
        if (error) throw error;
        hid = data.id;
      }
      const { data, error } = await supabase().rpc("join_challenge", { p_token: token, p_habit_id: hid, p_goal: pGoal, p_times: pTimes });
      if (error) {
        if (hid && habitId === "new") await supabase().from("habits").delete().eq("id", hid);
        throw error;
      }
      if (data === "requested") { setRequested(true); setBusy(false); return; }
      router.replace(`/challenges/${inv.challenge_id}`);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="row" style={{ fontSize: 14 }}><span className="muted" style={{ flex: 1 }}>{label}</span><b style={{ textAlign: "right" }}>{value}</b></div>
  );

  return (
    <main className="page" style={{ minHeight: "100dvh", paddingBottom: 30, gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 4 }}><FrejasMark size={36} /><FrejasWordmark height={20} /></div>
      <div style={{ margin: "0 -20px" }}><Cover preset={inv.cover_preset} height={150} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatars people={inv.member_names.map((n) => ({ name: n }))} size={36} ring="var(--bg)" />
        <div style={{ fontSize: 14 }}><b>{inv.member_names[0]}</b>{inv.member_names.length > 1 ? ` and ${inv.member_names.length - 1} more` : ""} invited you to</div>
      </div>
      <h1 className="h1" style={{ fontSize: 30 }}>{inv.name}</h1>
      <div className="card group">
        {v2 ? row("Goal", own ? "Everyone sets their own" : scheduleLabel(inv)) : row("Goal type", inv.goal_type === "own" ? "Own goals" : "Shared goal")}
        {row("Dates", `${formatShort(inv.starts_on)} – ${formatShort(inv.ends_on)}`)}
        {v2 && row("Who wins", winRuleLabel(inv.win_rule))}
        {inv.stake && <div className="row" style={{ fontSize: 14 }}><span className="muted" style={{ flex: 1 }}>At stake</span>
          <span className="tag tag-accent" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 800 }}><Icon name="coffee" size={15} color="var(--accent)" />{inv.stake}</span></div>}
      </div>

      {requested ? (
        <>
          <div className="soft" style={{ padding: 18, borderRadius: 22, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Icon name="clock" size={22} />
            <div>
              <div style={{ fontWeight: 800 }}>Request sent</div>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>{inv.member_names[0]} lets people in. You'll find it under Challenges once you're approved.</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Link href="/challenges" className="btn btn-soft">Go to my challenges</Link>
        </>
      ) : !session ? (
        <>
          <div style={{ flex: 1 }} />
          <Link href={`/welcome?invite=${token}`} className="btn btn-primary">Create account to join</Link>
          <Link href={`/welcome?invite=${token}`} className="btn btn-soft">I already have an account</Link>
        </>
      ) : !profile?.display_name ? null : (
        <>
          {habits.length > 0 && (
            <>
              <div className="label">Counts on</div>
              <label className="field"><Icon name="sun" color="var(--ink-2)" />
                <select value={habitId} onChange={(e) => setHabitId(e.target.value)} aria-label="Habit" style={{ border: 0, background: "none", width: "100%", fontSize: 15, fontWeight: 700, outline: 0 }}>
                  <option value="new">New habit: {inv.name}</option>
                  {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
              <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>
                {habitId === "new" ? "A new habit shows up on Today. When the challenge ends, you choose whether to keep it." : "Ticking this habit on Today checks you in here too."}
              </div>
            </>
          )}
          {askTimes && (
            <>
              <div className="label">Your goal</div>
              <div className="field" style={{ justifyContent: "space-between" }}>
                <button className="icon-btn" aria-label="Fewer" disabled={times <= 1} onClick={() => setTimes((n) => n - 1)}><Icon name="minus" /></button>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{times}× a week</span>
                <button className="icon-btn" aria-label="More" disabled={times >= 7} onClick={() => setTimes((n) => n + 1)}><Icon name="plus" /></button>
              </div>
            </>
          )}
          {askAmount && (
            <>
              {!askTimes && <div className="label">Your goal</div>}
              <label className="field"><input inputMode="decimal" placeholder={inv.min_amount ? fmt(inv.min_amount) : "e.g. 10000"} value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^0-9.,]/g, ""))} aria-label="Your goal" />
                <span className="muted" style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{unitLabel} {v2 ? "per session" : "per day"}</span></label>
            </>
          )}
          {(askTimes || askAmount) && <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>Others see your goal. It locks when the challenge starts.</div>}
          {approve && <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>{inv.member_names[0]} approves new people, so you'll send a request.</div>}
          {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={busy || (askAmount && !(num > 0))} onClick={join}>
            <Icon name={approve ? "send" : "check"} stroke={2.2} />{busy ? (approve ? "Sending…" : "Joining…") : approve ? "Ask to join" : "Join challenge"}
          </button>
          <Link href="/" className="btn btn-soft">Not now</Link>
        </>
      )}
    </main>
  );
}
