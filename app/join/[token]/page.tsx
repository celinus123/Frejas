"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Avatars } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { formatShort } from "@/lib/dates";
import { loadHabits } from "@/lib/data";
import type { Habit } from "@/lib/types";

interface Invite { challenge_id: string; name: string; goal_type: "own" | "shared"; unit: string | null; starts_on: string; ends_on: string; stake: string | null; member_names: string[] }

export default function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { session, userId, profile } = useApp();
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitId, setHabitId] = useState("new");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase().rpc("get_invite", { p_token: token }).then(({ data }) => setInv((data as Invite[] | null)?.[0] ?? null));
  }, [token]);

  useEffect(() => {
    if (!userId || !inv) return;
    loadHabits(userId).then(setHabits);
    supabase().from("challenge_members").select("challenge_id").eq("challenge_id", inv.challenge_id).eq("user_id", userId).maybeSingle()
      .then(({ data }) => { if (data) router.replace(`/challenges/${inv.challenge_id}`); });
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

  const needsGoal = inv.goal_type === "own" && !!inv.unit;
  const num = Number(goal.replace(",", "."));

  async function join() {
    if (!userId) return;
    setBusy(true); setErr(null);
    try {
      let hid: string | null = habitId;
      if (habitId === "new") {
        const { data, error } = await supabase().from("habits").insert({ owner_id: userId, name: inv!.name.slice(0, 60), frequency: "daily" }).select().single();
        if (error) throw error;
        hid = data.id;
      }
      const { data, error } = await supabase().rpc("join_challenge", { p_token: token, p_habit_id: hid, p_goal: inv!.goal_type === "own" ? (needsGoal ? num : 1) : null });
      if (error) throw error;
      router.replace(`/challenges/${data}`);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  return (
    <main className="page" style={{ minHeight: "100dvh", paddingBottom: 30, gap: 14 }}>
      <div style={{ height: 30 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatars people={inv.member_names.map((n) => ({ name: n }))} size={40} ring="var(--bg)" />
        <div style={{ fontSize: 14 }}><b>{inv.member_names[0]}</b> invited you to</div>
      </div>
      <h1 className="h1" style={{ fontSize: 30 }}>{inv.name}</h1>
      <div className="card group">
        <div className="row" style={{ fontSize: 14 }}><span className="muted" style={{ flex: 1 }}>Goal type</span><b>{inv.goal_type === "own" ? "Own goals" : "Shared goal"}</b></div>
        <div className="row" style={{ fontSize: 14 }}><span className="muted" style={{ flex: 1 }}>Dates</span><b>{formatShort(inv.starts_on)} – {formatShort(inv.ends_on)}</b></div>
        {inv.stake && <div className="row" style={{ fontSize: 14 }}><span className="muted" style={{ flex: 1 }}>At stake</span>
          <span className="tag tag-accent" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 800 }}><Icon name="coffee" size={15} color="var(--accent)" />{inv.stake}</span></div>}
      </div>

      {!session ? (
        <>
          <div style={{ flex: 1 }} />
          <Link href={`/welcome?invite=${token}`} className="btn btn-primary">Create account to join</Link>
          <Link href={`/welcome?invite=${token}`} className="btn btn-soft">I already have an account</Link>
        </>
      ) : !profile?.display_name ? null : (
        <>
          <div className="label">Habit it counts for</div>
          <label className="field"><Icon name="sun" color="var(--ink-2)" />
            <select value={habitId} onChange={(e) => setHabitId(e.target.value)} aria-label="Habit" style={{ border: 0, background: "none", width: "100%", fontSize: 15, fontWeight: 700, outline: 0 }}>
              <option value="new">New habit: {inv.name}</option>
              {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          {needsGoal && (
            <>
              <div className="label">Your goal</div>
              <label className="field"><input inputMode="decimal" placeholder="e.g. 10000" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^0-9.,]/g, ""))} aria-label="Your goal" />
                <span className="muted" style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{inv.unit} per day</span></label>
              <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>Others see your goal. It locks when the challenge starts.</div>
            </>
          )}
          {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={busy || (needsGoal && !(num > 0))} onClick={join}><Icon name="check" stroke={2.4} />{busy ? "Joining…" : "Join challenge"}</button>
          <Link href="/" className="btn btn-soft">Not now</Link>
        </>
      )}
    </main>
  );
}
