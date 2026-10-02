"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Cover } from "@/components/Cover";
import { FrejasMark } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { StakeLine } from "@/components/Stake";
import { MembersIn } from "@/components/MembersIn";
import { forgetInvite, saveInvite } from "@/lib/savedInvites";
import { supabase } from "@/lib/supabase";
import { formatShort, today } from "@/lib/dates";
import { invitePreview, loadHabits, type InvitePreview } from "@/lib/data";
import { bestMatch } from "@/lib/similar";
import { fmt, isFull, joinByLabel, joinClosed, placesLabel, scheduleLabel, winRuleLabel } from "@/lib/scoring";
import type { Habit } from "@/lib/types";

type Invite = InvitePreview;

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
    invitePreview(token).then((i) => {
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
      forgetInvite(token);
      if (data === "requested") { setRequested(true); setBusy(false); return; }
      router.replace(`/challenges/${inv.challenge_id}`);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  const chip = (text: React.ReactNode) => <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "var(--soft)" }}>{text}</span>;
  const first = inv.member_names[0] ?? "A friend";
  const closed = joinClosed(inv);
  const full = isFull(inv);

  return (
    <main className="page" style={{ minHeight: "100dvh", paddingBottom: 30, gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", minHeight: 40 }}><FrejasMark size={38} /></div>
      <div style={{ margin: "0 -20px" }}><Cover preset={inv.cover_preset} height={170} /></div>
      {/* the same card as an invitation inside the app */}
      <section className="card" style={{ marginTop: -62, position: "relative", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{approve ? `${first}'s challenge` : "You're invited to"}</span>
        <h1 className="h1">{inv.name}</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chip(v2 ? (own ? "Everyone sets their own goal" : scheduleLabel(inv)) : inv.goal_type === "own" ? "Own goals" : "Shared goal")}
          {chip(`${formatShort(inv.starts_on)} – ${formatShort(inv.ends_on)}`)}
          {v2 && chip(winRuleLabel(inv.win_rule))}
          {joinByLabel(inv) && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: "var(--accent-bg)" }}><Icon name="clock" size={13} />{joinByLabel(inv)}</span>}
        </div>
        {inv.stake && <StakeLine stake={inv.stake} />}
        <MembersIn names={inv.member_names} count={inv.member_count} />
        {placesLabel(inv) && <div className="t-text muted" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="users" size={15} />{placesLabel(inv)}{!full && inv.taken !== inv.member_count ? " (some are waiting for an answer)" : ""}</div>}
      </section>

      {closed && !requested ? (
        <>
          <div className="soft" style={{ padding: 18, borderRadius: 22, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Icon name="clock" size={22} />
            <div>
              <div style={{ fontWeight: 800 }}>Joining has closed</div>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>The last day to join was {formatShort(inv.join_by!)}. {first} can open it again from the challenge&apos;s menu.</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Link href={session ? "/challenges" : "/"} className="btn btn-soft">{session ? "Go to my challenges" : "Go to Frejas"}</Link>
        </>
      ) : full && !requested ? (
        <>
          <div className="soft" style={{ padding: 18, borderRadius: 22, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Icon name="users" size={22} />
            <div>
              <div style={{ fontWeight: 800 }}>This challenge is full</div>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>It has room for {inv.max_members} people. {first} can make room from the challenge&apos;s menu.</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Link href={session ? "/challenges" : "/"} className="btn btn-soft">{session ? "Go to my challenges" : "Go to Frejas"}</Link>
        </>
      ) : requested ? (
        <>
          <div className="soft" style={{ padding: 18, borderRadius: 22, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Icon name="clock" size={22} />
            <div>
              <div style={{ fontWeight: 800 }}>Request sent</div>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>{first} lets people in. You'll find it under Challenges once you're approved.</div>
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
                <select value={habitId} onChange={(e) => setHabitId(e.target.value)} aria-label="Habit" style={{ border: 0, background: "none", width: "100%", fontSize: 16, fontWeight: 700, outline: 0 }}>
                  <option value="new">New habit: {inv.name}</option>
                  {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
              <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>
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
          {(askTimes || askAmount) && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>Others see your goal. It locks when the challenge starts.</div>}
          {approve && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>A link can be passed on to anyone, so {first} says yes to everyone who uses this one. Friends invited inside Frejas join straight away.</div>}
          {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={busy} onClick={() => (askAmount && !(num > 0) ? setErr("Type your goal first.") : join())}>
            <Icon name={approve ? "send" : "check"} stroke={2.2} />{busy ? (approve ? "Sending…" : "Joining…") : approve ? "Ask to join" : "Join challenge"}
          </button>
          {/* kept under Challenges → Invitations, so you can come back to it */}
          <button className="btn btn-soft" onClick={() => { saveInvite(token); router.replace("/challenges"); }}>Not now</button>
        </>
      )}
    </main>
  );
}
