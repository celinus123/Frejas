"use client";
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Flame, Icon } from "@/components/Icon";
import { Ring } from "@/components/Ring";
import { Avatar, Avatars, Sheet, Switch } from "@/components/ui";
import { Cover } from "@/components/Cover";
import { CheckInSheet } from "@/components/CheckInSheet";
import { supabase } from "@/lib/supabase";
import { addDays, diffDays, formatShort, parse, timeAgo, today, weekday } from "@/lib/dates";
import { alignHabitStart, backfillCheckins, ensureHabit, inviteUrl, loadChallenge, myFriends, shareLink } from "@/lib/data";
import { MAX_CHOICES, daysLeft, fmt, isV2, joinByLabel, joinClosed, ordinal, scheduleLabel, standings, totalDays, weekResults, weeksLeft, winRuleLabel, type Standing, type WeekResult } from "@/lib/scoring";
import { PostSheet, type Who } from "@/components/FeedPost";
import { StakeLine } from "@/components/Stake";
import { MembersIn } from "@/components/MembersIn";
import { SafetySheet } from "@/components/Safety";
import type { SafetyTarget } from "@/lib/safety";
import { addComment, react, removeComment, summary, type Social } from "@/lib/social";
import { D, type Emoji } from "@/lib/design";
import { signedUrls } from "@/lib/photos";
import type { Challenge, CheckIn, Member, Message } from "@/lib/types";

type Tab = "Overview" | "Leaderboard" | "Stats" | "Chat";
interface Req { user_id: string; goal_amount: number | null; times_per_week: number | null; profiles?: { display_name: string; avatar_path: string | null } | null }

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: strong ? "var(--primary)" : "var(--soft)", color: strong ? "var(--on-primary)" : "var(--ink)" }}>{children}</span>;
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);
  const ms = Math.max(0, parse(to).getTime() - now);
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {[[d, "days"], [h, "hours"], [m, "min"]].map(([v, l]) => (
        <div key={l as string} style={{ width: 68, padding: "10px 0", borderRadius: 16, background: "var(--accent-bg)", textAlign: "center" }}>
          <div className="font-display" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{String(v).padStart(2, "0")}</div>
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 4 }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

function ChallengePage({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { userId, toast } = useApp();
  const [data, setData] = useState<{ challenge: Challenge | null; members: Member[]; checkins: CheckIn[] } | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [checkin, setCheckin] = useState<{ existing?: CheckIn; date?: string } | null>(params.get("checkin") ? {} : null);
  const [weekIdx, setWeekIdx] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(params.get("created") === "1");
  const [menu, setMenu] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [habitName, setHabitName] = useState<string | undefined>();
  const [requests, setRequests] = useState<Req[]>([]);
  const [invited, setInvited] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [openCi, setOpenCi] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);      // the "last day to join" sheet
  const [newJoinBy, setNewJoinBy] = useState<string | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);        // the "who can join" sheet
  const [newFindable, setNewFindable] = useState(false);
  const [newMax, setNewMax] = useState<number | null>(null);
  const [safety, setSafety] = useState<SafetyTarget | null>(null);   // report or block
  const t = today();

  const load = useCallback(async () => {
    const d = await loadChallenge(id);
    setData(d);
    setPhotos(await signedUrls("photos", d.checkins.slice(0, 40).map((c) => c.photo_path)));
    if (d.challenge && d.challenge.creator_id === userId) {
      const { data: r } = await supabase().from("join_requests").select("user_id, goal_amount, times_per_week").eq("challenge_id", id);
      const ids = (r ?? []).map((x: { user_id: string }) => x.user_id);
      const { data: ps } = ids.length ? await supabase().from("profiles").select("id, display_name, avatar_path").in("id", ids) : { data: [] };
      const byId = new Map((ps ?? []).map((p: { id: string; display_name: string; avatar_path: string | null }) => [p.id, p]));
      setRequests(((r ?? []) as Req[]).map((x) => ({ ...x, profiles: byId.get(x.user_id) ?? null })));
    }
    if (d.challenge && userId && !d.members.some((m) => m.user_id === userId)) {
      const { data: inv } = await supabase().from("challenge_invites").select("challenge_id").eq("challenge_id", id).eq("user_id", userId).maybeSingle();
      setInvited(!!inv);
    }
  }, [id, userId]);
  useEffect(() => { load().catch(() => setData({ challenge: null, members: [], checkins: [] })); }, [load]);

  const c = data?.challenge ?? null;
  const me = data?.members.find((m) => m.user_id === userId);

  const ensuring = useRef(false);
  // drafts open in the editor; members without a habit get one so Today shows it
  useEffect(() => {
    if (c?.status === "draft" && c.creator_id === userId) router.replace(`/challenges/new?draft=${c.id}`);
    // a friend's challenge you found under Challenges but aren't in: its page is the "ask to join" page
    else if (c && data && !data.members.some((m) => m.user_id === userId) && !invited && c.visibility === "friends" && c.creator_id !== userId) router.replace(`/join/${c.invite_token}`);
  }, [c, data, invited, userId, router]);
  useEffect(() => {
    if (!c || !me || !userId) return;
    if (!me.habit_id) { if (ensuring.current) return; ensuring.current = true; }
    (async () => {
      const hid = me.habit_id ?? (await ensureHabit(c, me, userId));
      if (hid) {
        const { data: h } = await supabase().from("habits").select("name").eq("id", hid).maybeSingle();
        setHabitName((h as { name: string } | null)?.name);
        if (!me.habit_id) load();
      }
    })();
  }, [c, me, userId, load]);

  const st = useMemo(() => (c ? standings(c, data!.members, data!.checkins) : []), [c, data]);

  if (!data) return <main className="page"><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 300 }} /></main>;

  if (c && !me && invited) return <InviteView c={c} onJoined={load} />;
  if (c && !me && c.visibility === "friends" && c.creator_id !== userId) return <main className="page"><div className="skeleton" style={{ height: 220 }} /></main>;   // on its way to the "ask to join" page
  if (!c || !me) return (
    <main className="page">
      <button className="icon-btn" aria-label="Back" onClick={() => router.push("/challenges")}><Icon name="left" /></button>
      <div className="card" style={{ padding: 24, textAlign: "center" }}><div className="h1" style={{ fontSize: 22 }}>Challenge not found</div>
        <p className="muted">It may have been deleted, or you&apos;re not a member. Ask a friend for the invite link.</p></div>
    </main>
  );

  const group = !c.solo;
  const upcoming = t < c.starts_on;
  const finished = t > c.ends_on;
  const isCreator = c.creator_id === userId;
  const myIdx = st.findIndex((s) => s.user_id === userId);
  const mine = st[myIdx];
  const url = inviteUrl(c.invite_token);
  const myCheckins = data.checkins.filter((x) => x.user_id === userId);
  const shown = data.checkins.filter((x) => !x.hidden);   // without the ones from someone there is a block with (they only count on the leaderboard)
  const weeks = isV2(c) ? weekResults(c, me, myCheckins) : [];
  const curIdx = weeks.findIndex((w) => w.isCurrent);
  const wi = weekIdx !== null && weeks[weekIdx] && !weeks[weekIdx].isFuture ? weekIdx : curIdx >= 0 ? curIdx : weeks.length - 1;
  const thisWeek = weeks[wi];

  async function share() {
    await toGroup();
    const r = await shareLink(url, c!.name);
    if (r === "copied") toast({ text: "Link copied. Paste it in your group chat." });
  }
  // "Make it a group challenge" only opens the invitation. The challenge becomes a group challenge
  // when you actually invite someone or share the link, so changing your mind leaves everything as it was.
  async function toGroup() {
    if (!c!.solo) return;
    await supabase().from("challenges").update({ solo: false }).eq("id", c!.id);
    await load();
  }
  async function toSolo() {
    await supabase().from("challenge_invites").delete().eq("challenge_id", c!.id).eq("invited_by", userId!);
    const { error } = await supabase().from("challenges").update({ solo: true }).eq("id", c!.id);
    if (error) { toast({ text: error.message }); return; }
    setMenu(false); setTab("Overview");
    toast({ text: "It's just you again. Your progress is kept." });
    load();
  }
  async function startToday() {
    await supabase().from("challenges").update({ starts_on: t }).eq("id", c!.id);
    if (me!.habit_id) await supabase().from("habits").update({ starts_on: t }).eq("id", me!.habit_id);
    toast({ text: "It starts today. Good luck!" });
    load();
  }
  // the creator can move the start, e.g. back a few days to count what was already done
  const firstCheckin = data.checkins.reduce<string | null>((a, x) => (!a || x.checkin_date < a ? x.checkin_date : a), null);
  const maxStart = firstCheckin && firstCheckin < c.ends_on ? firstCheckin : c.ends_on;
  async function changeStart() {
    const d = newStart;
    if (!d || d === c!.starts_on) { setStartOpen(false); return; }
    if (d > maxStart) return;
    const { error } = await supabase().from("challenges").update({ starts_on: d }).eq("id", c!.id);
    if (error) { toast({ text: error.message }); return; }
    let added = 0;
    if (me!.habit_id) {
      const { data: h } = await supabase().from("habits").select("from_challenge").eq("id", me!.habit_id).maybeSingle();
      if ((h as { from_challenge: string | null } | null)?.from_challenge === c!.id) await supabase().from("habits").update({ starts_on: d }).eq("id", me!.habit_id);
      else await alignHabitStart(me!.habit_id, d);
      added = await backfillCheckins({ ...c!, starts_on: d }, me!.habit_id, userId!).catch(() => 0);
    }
    setStartOpen(false); setMenu(false);
    toast({ text: <><b>{d > t ? "Starts" : "Started"} {formatShort(d)}.</b>{added ? ` ${added} ${added === 1 ? "day" : "days"} you'd already ticked ${added === 1 ? "is" : "are"} checked in.` : d < t ? " Tap a day in the week view to check in for it." : ""}</> });
    load();
  }
  async function saveWho() {
    const taken = data!.members.length + requests.length;
    const { error } = await supabase().from("challenges").update({ visibility: newFindable ? "friends" : "invite", max_members: newMax, ...(newFindable ? { join_mode: "approve" } : {}) }).eq("id", c!.id);
    if (error) { toast({ text: /visibility|max_members/.test(error.message) ? "This isn't switched on yet. Try again in a little while." : error.message }); return; }
    setWhoOpen(false);
    toast({ text: newMax && taken >= newMax ? <>Saved. It&apos;s full now: {taken} of {newMax} places are taken.</> : newFindable ? "Saved. Your friends can find it under Challenges and ask to join." : "Saved. Only people you invite can find it." });
    load();
  }
  async function saveJoinBy() {
    const { error } = await supabase().from("challenges").update({ join_by: newJoinBy }).eq("id", c!.id);
    if (error) { toast({ text: /join_by/.test(error.message) ? "This isn't switched on yet. Try again in a little while." : error.message }); return; }
    setJoinOpen(false);
    toast({ text: newJoinBy ? <>Friends can join until <b>{formatShort(newJoinBy)}</b>.</> : "Friends can join for as long as it runs." });
    load();
  }
  async function leave() {
    if (!confirm(`Leave ${c!.name}? Your check-ins stay in the group's history.`)) return;
    await supabase().from("challenge_members").delete().eq("challenge_id", c!.id).eq("user_id", userId!);
    router.replace("/challenges");
  }
  async function remove() {
    if (!confirm(`Delete ${c!.name}${group ? " for everyone" : ""}? All check-ins in it are removed.`)) return;
    await supabase().from("challenges").delete().eq("id", c!.id);
    router.replace("/challenges");
  }
  async function newLink() {
    const { error } = await supabase().rpc("rotate_invite", { p_challenge: c!.id });
    if (!error) { toast({ text: "New link created. The old one no longer works." }); load(); }
  }
  async function mute(v: boolean) {
    await supabase().from("challenge_members").update({ muted: v }).eq("challenge_id", c!.id).eq("user_id", userId!);
    load();
  }
  async function approve(r: Req, ok: boolean) {
    if (ok) await supabase().rpc("approve_request", { p_challenge: c!.id, p_user: r.user_id });
    else await supabase().from("join_requests").delete().eq("challenge_id", c!.id).eq("user_id", r.user_id);
    toast({ text: ok ? `${r.profiles?.display_name ?? "They"} joined.` : "Request declined." });
    load();
  }
  // reactions and comments on a check-in work the same way here as in the feed
  const socialOf = (ci: CheckIn): Social => ({
    reactions: (ci.reactions ?? []).map((r) => ({ user_id: r.user_id, emoji: r.emoji ?? "❤️" })),
    comments: [...(ci.comments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  });
  const patchCi = (cid: string, fn: (x: CheckIn) => CheckIn) => setData((d) => d && { ...d, checkins: d.checkins.map((x) => (x.id === cid ? fn(x) : x)) });
  const who: Who = (uid) => {
    const p = data.members.find((m) => m.user_id === uid)?.profiles;
    return { name: p?.display_name ?? "Former member", path: p?.avatar_path ?? null, you: uid === userId };
  };
  async function onReact(ci: CheckIn, emoji: Emoji | null) {
    const had = !!ci.reactions?.some((r) => r.user_id === userId);
    const before = ci.reactions;
    patchCi(ci.id, (x) => ({ ...x, reactions: [...(x.reactions ?? []).filter((r) => r.user_id !== userId), ...(emoji ? [{ user_id: userId!, emoji }] : [])] }));
    try { await react({ kind: "checkin", id: ci.id }, userId!, emoji, had); }
    catch { patchCi(ci.id, (x) => ({ ...x, reactions: before })); toast({ text: "Couldn't save your reaction. Try again." }); }
  }
  async function onComment(ci: CheckIn, body: string) {
    const made = await addComment({ kind: "checkin", id: ci.id }, userId!, body);
    patchCi(ci.id, (x) => ({ ...x, comments: [...(x.comments ?? []), made] }));
  }
  async function onDeleteComment(ci: CheckIn, commentId: string) {
    const before = ci.comments;
    patchCi(ci.id, (x) => ({ ...x, comments: (x.comments ?? []).filter((m) => m.id !== commentId) }));
    try { await removeComment({ kind: "checkin", id: ci.id }, commentId); }
    catch { patchCi(ci.id, (x) => ({ ...x, comments: before })); toast({ text: "Couldn't delete the comment." }); }
  }

  const schedule = isV2(c) ? scheduleLabel(c, me.times_per_week, me.goal_amount) : mine?.goalLabel ?? "";
  const timeChip = upcoming ? `Starts ${formatShort(c.starts_on)}` : finished ? `Ended ${formatShort(c.ends_on)}` : isV2(c) && totalDays(c) > 14 ? `${weeksLeft(c)} weeks left` : `${daysLeft(c)} days left`;

  const hero = (
    <>
      <div style={{ position: "relative", margin: "calc(-1 * (env(safe-area-inset-top) + 18px)) -20px 0" }}>
        <Cover preset={c.cover_preset} path={c.cover_path} height={220} />
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 18px)", left: 20, right: 20, display: "flex", justifyContent: "space-between" }}>
          <button className="icon-btn" aria-label="Back" onClick={() => router.push("/challenges")}><Icon name="left" /></button>
          <button className="icon-btn" aria-label="More" onClick={() => setMenu(true)}><Icon name="more" /></button>
        </div>
      </div>
      <section className="card" style={{ marginTop: -48, position: "relative", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Chip strong><Icon name={group ? "users" : "user"} size={13} />{group ? "With friends" : "Just me"}</Chip>
          {group && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Avatars people={data.members.map((m) => ({ name: m.profiles?.display_name ?? "", path: m.profiles?.avatar_path }))} size={26} />
              <button aria-label="Invite friends" onClick={() => setInviteOpen(true)} style={{ width: 30, height: 30, borderRadius: "50%", border: 0, background: "var(--soft-l)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={15} stroke={2.4} /></button>
            </div>
          )}
        </div>
        <h1 className="h1">{c.name}</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {schedule && <Chip>{schedule}</Chip>}<Chip>{timeChip}</Chip>{group && isV2(c) && <Chip>{winRuleLabel(c.win_rule)}</Chip>}
        </div>
        {c.stake && group && <StakeLine stake={c.stake} />}
      </section>
    </>
  );

  // ---------------------------------------------------------------- coming up
  if (upcoming) return (
    <main className="page">
      {hero}
      <section className="card" style={{ padding: "18px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
        <Chip><Icon name="clock" size={13} />Coming up</Chip>
        <Countdown to={c.starts_on} />
        <div className="muted" style={{ fontSize: 13 }}>Starts {parse(c.starts_on).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · {Math.ceil(totalDays(c) / 7)} weeks</div>
      </section>
      <button className="soft" onClick={() => setInviteOpen(true)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 24, border: 0, textAlign: "left" }}>
        <span style={{ width: 40, height: 40, borderRadius: 14, background: "var(--surface)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="users" /></span>
        <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: "var(--t-title)", fontWeight: 800 }}>{group ? "Invite more friends" : "Bring a friend"}</span><span className="muted" style={{ display: "block", fontSize: "var(--t-sub)" }}>Invite someone before it starts</span></span>
        <Icon name="right" size={16} />
      </button>
      {isCreator && <button onClick={startToday} style={{ height: 44, border: 0, background: "none", fontSize: 14, fontWeight: 800, color: "var(--primary)" }}>Start today instead</button>}
      {sheets()}
    </main>
  );

  // ---------------------------------------------------------------- shared pieces
  const progressCard = mine && (
    <section className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 16 }}>
      <Ring size={76} stroke={8} pct={mine.progress}><span className="ring-num" style={{ fontSize: 16 }}>{mine.progress}%</span></Ring>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{isV2(c) ? `${mine.done} of ${mine.target} sessions` : group ? `You're ${ordinal(myIdx + 1)}` : `${mine.done} days`}</span>
          {mine.finished && <span className="tag tag-accent" style={{ fontWeight: 800 }}>Made it</span>}
          {weeks.some((w) => w.extra > 0) && <span className="tag tag-accent" style={{ fontWeight: 800 }}>+{weeks.reduce((x, w) => x + w.extra, 0)} bonus</span>}
        </div>
        {group && isV2(c) && c.win_rule !== "finishers" && <div className="muted" style={{ fontSize: "var(--t-sub)" }}>You&apos;re {ordinal(myIdx + 1)} of {st.length} · {mine.display}</div>}
        {!group && isV2(c) && !finished && <div className="muted" style={{ fontSize: "var(--t-sub)" }}>{mine.consistency >= 80 ? "On track" : "A few sessions behind — you've got this"}</div>}
        {mine.currentStreak > 0 && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700 }}><Flame size={15} />{mine.currentStreak} {mine.streakUnit} in a row</div>}
      </div>
    </section>
  );

  const weekCard = thisWeek && (
    <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="icon-btn" aria-label="Previous week" disabled={wi <= 0} onClick={() => setWeekIdx(wi - 1)} style={{ width: 30, height: 30, boxShadow: "none", background: "none", opacity: wi <= 0 ? 0.25 : 1 }}><Icon name="left" size={16} /></button>
        <span style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 800 }}>{thisWeek.isCurrent ? "This week" : `${formatShort(thisWeek.from)} – ${formatShort(thisWeek.to)}`}</span>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{thisWeek.done} of {thisWeek.target}</span>
        {thisWeek.extra > 0 && <span className="tag tag-accent" style={{ fontWeight: 800 }}>+{thisWeek.extra} bonus</span>}
        <button className="icon-btn" aria-label="Next week" disabled={thisWeek.isCurrent || !weeks[wi + 1] || weeks[wi + 1].isFuture} onClick={() => setWeekIdx(wi + 1)}
          style={{ width: 30, height: 30, boxShadow: "none", background: "none", opacity: thisWeek.isCurrent || !weeks[wi + 1] || weeks[wi + 1].isFuture ? 0.25 : 1 }}><Icon name="right" size={16} /></button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(thisWeek.from, i - (weekday(thisWeek.from) - 1));
          const inRange = d >= c.starts_on && d <= c.ends_on;
          const dayCi = myCheckins.find((x) => x.checkin_date === d);
          const done = !!dayCi;
          const planned = c.frequency === "specific_days" ? (c.days ?? []).includes(i + 1) : true;
          const tappable = inRange && d <= t && !finished;
          return (
            <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, opacity: inRange ? 1 : 0.35 }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{"MTWTFSS"[i]}</span>
              <button disabled={!tappable} onClick={() => setCheckin(dayCi ? { existing: dayCi } : { date: d })}
                aria-label={done ? `Edit check-in for ${formatShort(d)}` : `Check in for ${formatShort(d)}`}
                style={{ width: 34, height: 34, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? "var(--primary)" : d === t ? "var(--soft-l)" : "none", color: "var(--on-primary)", border: done ? 0 : `2px ${planned ? "solid" : "dotted"} var(--soft)`, boxSizing: "border-box", cursor: tappable ? "pointer" : "default" }}>
                {done ? <Icon name="check" size={16} stroke={2.6} /> : tappable && d !== t && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-2)" }}>{parse(d).getDate()}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );

  // A check-in in the list: who and what on the left, the photo filling the right side, reactions and comments along the bottom.
  const latest = (list: CheckIn[]) => list.slice(0, 30).map((ci) => {
    const mineCi = ci.user_id === userId;
    const soc = socialOf(ci);
    const sum = summary(soc);
    const reacted = soc.reactions.some((r) => r.user_id === userId);
    const photo = ci.photo_path ? photos[ci.photo_path] : undefined;
    return (
      <article key={ci.id} className="card ci-card">
        <div className="ci-main">
          <div className="who">
            <Avatar name={ci.profiles?.display_name ?? ""} path={ci.profiles?.avatar_path} size={30} />
            <b>{mineCi ? "You" : ci.profiles?.display_name}</b><span>{ci.checkin_date === t ? timeAgo(ci.created_at) : formatShort(ci.checkin_date)}</span>
            {mineCi && !finished && <button onClick={() => setCheckin({ existing: ci })} aria-label="Edit check-in" className="muted" style={{ marginLeft: "auto", border: 0, background: "none", padding: 6, margin: "-6px -6px -6px auto" }}><Icon name="edit" size={D.icon.action} /></button>}
          </div>
          <button onClick={() => setOpenCi(ci.id)} aria-label={`Open ${ci.title}`} style={{ border: 0, background: "none", padding: 0, textAlign: "left", display: "flex", flexDirection: "column", gap: 2, color: "inherit" }}>
            <span className="t-title">{ci.title}{ci.amount ? ` · ${fmt(ci.amount)} ${c.unit ?? ""}` : ""}</span>
            {ci.comment && <span className="t-sub">{ci.comment}</span>}
          </button>
          {group && (
            <div className="acts" style={{ marginTop: "auto", paddingTop: 4 }}>
              <button className={reacted ? "rbtn mine" : "rbtn"} aria-pressed={reacted} aria-label={reacted ? "Remove your reaction" : "React with a heart"} onClick={() => onReact(ci, reacted ? null : "❤️")}><Icon name="heart" size={D.icon.action} /></button>
              {sum.total > 0 && <span className="sum" aria-label={`${sum.total} ${sum.total === 1 ? "reaction" : "reactions"}`}>{sum.emojis.slice(0, 3).map((x) => <i key={x.e} className="em">{x.e}</i>)}</span>}
              <button className="cbtn" onClick={() => setOpenCi(ci.id)} aria-label={soc.comments.length ? `${soc.comments.length} comments. Open` : "Write a comment"}><Icon name="comment" size={D.icon.action} />{soc.comments.length || ""}</button>
            </div>
          )}
        </div>
        {photo && <button className="ci-photo" onClick={() => setOpenCi(ci.id)} aria-label={`Open photo: ${ci.title}`}><img src={photo} alt="" /></button>}
      </article>
    );
  });

  const result = finished && st[0] && (
    <section className="card" style={{ padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="trophy" size={36} color="var(--accent)" stroke={1.6} /></div>
      {!group ? <div className="h1" style={{ fontSize: 26 }}>{mine?.finished ? "You made it!" : "Challenge complete"}</div>
        : c.win_rule === "finishers" ? <div className="h1" style={{ fontSize: 26 }}>{st.filter((s) => s.finished).length} of {st.length} made it!</div>
          : <div className="h1" style={{ fontSize: 26 }}>{st[0].user_id === userId ? "You won!" : `${st[0].name} wins!`}</div>}
      <div className="muted" style={{ fontSize: 14 }}>{mine ? `${mine.done} of ${mine.target} sessions · ${mine.progress}%` : ""}</div>
      <button className="btn btn-soft btn-sm" onClick={() => router.push("/challenges/new")}>Start a new one</button>
    </section>
  );

  // the most used button on the page: straight under the title box, in raspberry
  const checkInBtn = !finished && <button className="btn btn-accent" onClick={() => setCheckin({})}><Icon name="check" stroke={2.4} />Check in</button>;
  const tabs: Tab[] = group ? ["Overview", "Leaderboard", "Stats", "Chat"] : ["Overview", "Stats"];
  const shownTab: Tab = tabs.includes(tab) ? tab : "Overview";
  const tabBar = (
    <div className="no-scrollbar" role="group" aria-label="Sections" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -20px", padding: "2px 20px 4px" }}>
      {tabs.map((x) => <button key={x} className="chip" aria-pressed={shownTab === x} onClick={() => setTab(x)}>{x}</button>)}
    </div>
  );

  // ---------------------------------------------------------------- just me
  if (!group) return (
    <main className="page">
      {hero}
      {checkInBtn}
      {tabBar}
      {shownTab === "Stats" ? mine && <SoloStats c={c} mine={mine} weeks={weeks} checkins={myCheckins} /> : (
        <>
          {result}
          {progressCard}
          {!finished && weekCard}
          {!finished && (
            <button className="soft" onClick={() => setInviteOpen(true)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 24, border: 0, textAlign: "left" }}>
              <span style={{ width: 40, height: 40, borderRadius: 14, background: "var(--surface)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="users" /></span>
              <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: "var(--t-title)", fontWeight: 800 }}>Make it a group challenge</span><span className="muted" style={{ display: "block", fontSize: "var(--t-sub)" }}>Invite friends. Your progress so far is kept.</span></span>
              <Icon name="right" size={16} />
            </button>
          )}
          {myCheckins.length > 0 && <><h2 className="h2" style={{ marginTop: 14 }}>Your check-ins</h2>{latest(myCheckins)}</>}
        </>
      )}
      {sheets()}
    </main>
  );

  // ---------------------------------------------------------------- with friends
  return (
    <main className="page" style={shownTab === "Chat" ? { paddingBottom: 170 } : undefined}>
      {hero}
      {checkInBtn}
      {isCreator && requests.map((r) => (
        <section key={r.user_id} className="card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={r.profiles?.display_name ?? "?"} path={r.profiles?.avatar_path} size={36} />
          <div style={{ flex: 1, fontSize: 13.5 }}><b>{r.profiles?.display_name ?? "Someone"}</b> wants to join</div>
          <button className="btn btn-primary btn-sm" onClick={() => approve(r, true)}>Approve</button>
          <button aria-label="Decline" onClick={() => approve(r, false)} style={{ width: 36, height: 36, borderRadius: "50%", border: 0, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={16} /></button>
        </section>
      ))}
      {tabBar}

      {shownTab === "Overview" && (
        <>
          {result}
          {progressCard}
          {!finished && weekCard}
          <h2 className="h2" style={{ marginTop: 14 }}>Latest</h2>
          {shown.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "0 4px" }}>No check-ins yet. Be the first!</div>}
          {latest(shown)}
        </>
      )}
      {shownTab === "Leaderboard" && <Leaderboard c={c} st={st} userId={userId!} finished={finished} />}
      {shownTab === "Stats" && <GroupStats c={c} st={st} checkins={data.checkins} userId={userId!} />}
      {shownTab === "Chat" && <Chat c={c} userId={userId!} members={data.members} onMore={setSafety} />}
      {sheets()}
    </main>
  );

  // ---------------------------------------------------------------- sheets (hoisted)
  function sheets() {
    return (
      <>
        {checkin && userId && (
          <CheckInSheet open onClose={() => setCheckin(null)} onSaved={() => { toast({ text: checkin.existing ? "Check-in updated." : <><b>Checked in!</b> Nice work.</> }); load(); }}
            challenge={c!} userId={userId} habitId={me!.habit_id} habitName={habitName} existing={checkin.existing ?? null} initialDate={checkin.date} minAmount={isV2(c!) ? (c!.same_goal ? c!.min_amount : me!.goal_amount ?? c!.min_amount) : null} />
        )}
        {(() => {
          const ci = openCi ? data!.checkins.find((x) => x.id === openCi) : null;
          return ci && userId ? (
            <PostSheet post={{ key: `c:${ci.id}`, ref: { kind: "checkin", id: ci.id }, at: ci.created_at, authorId: ci.user_id, ci, challenge: c! }} uid={userId} who={who}
              photo={ci.photo_path ? photos[ci.photo_path] : undefined} social={socialOf(ci)} onClose={() => setOpenCi(null)}
              onReact={(e) => onReact(ci, e)} onComment={(body) => onComment(ci, body)} onDelete={(cid) => onDeleteComment(ci, cid)}
              onMore={(x) => { setOpenCi(null); setSafety(x); }} />
          ) : null;
        })()}
        <SafetySheet target={safety} onClose={() => setSafety(null)} onBlocked={() => { setTab("Overview"); load().catch(() => {}); }} />
        <Sheet open={shareOpen} onClose={() => setShareOpen(false)} label="Invite friends">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 6 }}>
            {params.get("created") === "1" && <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={36} stroke={2.4} /></div>}
            <div className="h1" style={{ fontSize: 24 }}>{params.get("created") === "1" ? `${c!.name} is ready` : "Invite friends"}</div>
            <div className="muted" style={{ fontSize: 14, lineHeight: 1.45, maxWidth: 300 }}>
              {c!.join_mode === "approve" ? "Share the link. You approve everyone who asks to join." : "Anyone with the link can join."}
              {joinByLabel(c!) && <> <b style={{ color: "var(--ink)" }}>{joinByLabel(c!)}.</b>{joinClosed(c!) && isCreator ? " Open it again from the menu." : ""}</>}
            </div>
          </div>
          <div className="field" style={{ paddingRight: 6 }}>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url.replace(/^https?:\/\//, "")}</span>
            <button aria-label="Copy link" onClick={async () => { await toGroup(); await navigator.clipboard.writeText(url); toast({ text: "Link copied." }); }} style={{ width: 38, height: 38, borderRadius: 12, border: 0, background: "var(--soft-l)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="copy" size={18} /></button>
          </div>
          <button className="btn btn-primary" onClick={share}><Icon name="share" />Share link</button>
          <button className="btn btn-soft" onClick={() => { setShareOpen(false); setInviteOpen(true); }}><Icon name="users" />Invite friends on Frejas</button>
        </Sheet>
        <Sheet open={startOpen} onClose={() => setStartOpen(false)} label="Change start date">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="h1" style={{ fontSize: 22 }}>Start date</div>
            <button className="icon-btn" aria-label="Close" onClick={() => setStartOpen(false)}><Icon name="x" /></button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Move the start earlier to count days you had already done. {group ? "Everyone in the challenge gets the extra days. " : ""}
            {firstCheckin ? `It can't be later than the first check-in (${formatShort(firstCheckin)}).` : ""}
          </p>
          <label className="field"><Icon name="calendar" color="var(--ink-2)" />
            <input type="date" value={newStart} min={addDays(t, -365)} max={maxStart} onChange={(e) => setNewStart(e.target.value)} aria-label="Start date" style={{ minHeight: 44 }} />
          </label>
          {newStart > maxStart && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>Pick {formatShort(maxStart)} or earlier.</div>}
          <button className="btn btn-primary" onClick={changeStart}>
            <Icon name="check" stroke={2.4} />{newStart && newStart < c!.starts_on ? `Start ${formatShort(newStart)} instead` : "Save"}
          </button>
        </Sheet>
        <Sheet open={whoOpen} onClose={() => setWhoOpen(false)} label="Who can join">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="h1" style={{ fontSize: 22 }}>Who can join</div>
            <button className="icon-btn" aria-label="Close" onClick={() => setWhoOpen(false)}><Icon name="x" /></button>
          </div>
          <div role="radiogroup" aria-label="Who can find it" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {([[false, "Only people I invite", "Nobody else sees that it exists."], [true, "All my friends", "They see it under Challenges and can ask to join. You say yes to each one."]] as const).map(([v, title, sub]) => (
              <button key={title} role="radio" aria-checked={newFindable === v} onClick={() => { setNewFindable(v); if (v && newMax === null) setNewMax(20); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, border: 0, textAlign: "left", width: "100%", background: newFindable === v ? "var(--soft)" : "var(--surface)", boxShadow: newFindable === v ? "inset 0 0 0 2px var(--primary)" : "var(--shadow)" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{newFindable === v && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)" }} />}</span>
                <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 14.5, fontWeight: 800 }}>{title}</span><span className="muted" style={{ display: "block", fontSize: "var(--t-sub)", marginTop: 2 }}>{sub}</span></span>
              </button>
            ))}
          </div>
          <div className="label">How many can join</div>
          <div role="group" aria-label="How many can join" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="chip" aria-pressed={newMax === null} onClick={() => setNewMax(null)}>No limit</button>
            {MAX_CHOICES.map((n) => <button key={n} className="chip" aria-pressed={newMax === n} onClick={() => setNewMax(n)}>{n} people</button>)}
          </div>
          <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>
            Now: {data!.members.length} in it{requests.length ? `, ${requests.length} waiting for your answer` : ""}. People who wait take up a place too.
            {newFindable && c!.join_mode !== "approve" ? " Everyone who isn't invited will have to ask first, with the link too." : ""}
          </div>
          <button className="btn btn-primary" onClick={saveWho}><Icon name="check" stroke={2.4} />Save</button>
        </Sheet>
        <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Last day to join">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="h1" style={{ fontSize: 22 }}>Last day to join</div>
            <button className="icon-btn" aria-label="Close" onClick={() => setJoinOpen(false)}><Icon name="x" /></button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>After this day nobody new can join, with a link or an invitation. People who are already in are not affected.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="chip" aria-pressed={newJoinBy === null} onClick={() => setNewJoinBy(null)}>Any time</button>
            {t <= c!.ends_on && <button className="chip" aria-pressed={newJoinBy === t} onClick={() => setNewJoinBy(t)}>Today</button>}
            <label className="chip" aria-pressed={!!newJoinBy && newJoinBy !== t} style={{ position: "relative", cursor: "pointer" }}>
              <Icon name="calendar" size={15} />{newJoinBy && newJoinBy !== t ? formatShort(newJoinBy) : "Pick a date"}
              <input type="date" max={c!.ends_on} value={newJoinBy ?? t} onChange={(e) => e.target.value && setNewJoinBy(e.target.value > c!.ends_on ? c!.ends_on : e.target.value)} aria-label="Last day to join"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
            </label>
          </div>
          <button className="btn btn-primary" onClick={saveJoinBy}><Icon name="check" stroke={2.4} />Save</button>
        </Sheet>
        <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} c={c!} userId={userId!} members={data!.members} onShareLink={() => { setInviteOpen(false); setShareOpen(true); }} beforeInvite={toGroup} />
        <Sheet open={menu} onClose={() => setMenu(false)} label="Challenge menu">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="h1" style={{ fontSize: 22 }}>{c!.name}</div>
            <button className="icon-btn" aria-label="Close" onClick={() => setMenu(false)}><Icon name="x" /></button>
          </div>
          <div className="card group">
            {group ? (
              <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setMenu(false); setInviteOpen(true); }}>
                <Icon name="users" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Invite friends</div></button>
            ) : (
              <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setMenu(false); setInviteOpen(true); }}>
                <Icon name="users" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Make it a group challenge</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Your progress so far is kept</div></div></button>
            )}
            {group && isCreator && data!.members.length === 1 && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={toSolo}>
              <Icon name="user" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Make it just me again</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Nobody has joined yet. Invitations you sent are withdrawn.</div></div></button>}
            {group && <div className="row"><Icon name="bell" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Mute this challenge</div><Switch on={me!.muted} onChange={mute} label="Mute" /></div>}
            {isCreator && !finished && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setNewStart(c!.starts_on); setMenu(false); setStartOpen(true); }}>
              <Icon name="calendar" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Change start date</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{upcoming ? "Starts" : "Started"} {formatShort(c!.starts_on)} · move it earlier to count days you already did</div></div></button>}
            {group && isCreator && !finished && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setNewFindable(c!.visibility === "friends"); setNewMax(c!.max_members ?? null); setMenu(false); setWhoOpen(true); }}>
              <Icon name="users" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Who can join</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{c!.visibility === "friends" ? "All my friends can find it" : "Only people I invite"} · {c!.max_members ? `room for ${c!.max_members}` : "no limit"}</div></div></button>}
            {group && isCreator && !finished && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setNewJoinBy(c!.join_by ?? null); setMenu(false); setJoinOpen(true); }}>
              <Icon name="clock" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Last day to join</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{c!.join_by ? (joinClosed(c!) ? `Closed ${formatShort(c!.join_by)} · open it again` : `Until ${formatShort(c!.join_by)}`) : "Any time while it runs"}</div></div></button>}
            {group && isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={newLink}>
              <Icon name="shield" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Make a new invite link</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>The old link stops working</div></div></button>}
            {!isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={leave}>
              <Icon name="logout" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Leave challenge</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Your check-ins stay in the group&apos;s history</div></div></button>}
            {isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={remove}>
              <Icon name="trash" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Delete challenge</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{group ? "For everyone. " : ""}Can&apos;t be undone.</div></div></button>}
          </div>
        </Sheet>
      </>
    );
  }
}

// ---------------------------------------------------------------- leaderboard
function Leaderboard({ c, st, userId, finished }: { c: Challenge; st: Standing[]; userId: string; finished: boolean }) {
  const rule = isV2(c) ? c.win_rule : "consistent";
  const explain = rule === "finishers" ? `Everyone who reaches ${c.finish_pct}% of the goal is a winner.`
    : rule === "most" ? (c.unit ? `Most ${c.unit} in total wins.` : "Most sessions in total wins.")
      : "Highest % of their goal wins. Extra sessions in a week don't count.";
  const rows = rule === "finishers" ? [...st].sort((a, b) => b.progress - a.progress) : st;
  // a short push on your own row: how far it is to first place, or to making it
  const meIdx = rows.findIndex((s) => s.user_id === userId);
  const gapText = (n: number) => rule === "most" ? (c.unit ? `${fmt(n)} ${c.unit}` : `${fmt(n)} ${n === 1 ? "session" : "sessions"}`) : `${fmt(n)}%`;
  let nudge: string | null = null;
  if (!finished && meIdx >= 0) {
    const me = rows[meIdx];
    if (rule === "finishers") {
      const need = Math.ceil((me.target * c.finish_pct) / 100) - me.done;
      nudge = me.finished ? "You've made it. Everything from here is a bonus." : need > 0 ? `Only ${need} more ${need === 1 ? "session" : "sessions"} and you've made it` : null;
    } else if (rows.length > 1) {
      if (meIdx === 0) {
        const gap = me.value - rows[1].value;
        nudge = gap > 0 ? `You're in the lead, ${gapText(gap)} ahead of ${rows[1].name}` : `Level with ${rows[1].name}. Your next check-in decides it.`;
      } else {
        const gap = rows[0].value - me.value;
        nudge = gap > 0 ? `Only ${gapText(gap)} to 1st place` : `Level with ${rows[0].name}. One more check-in takes 1st place.`;
      }
    }
  }
  return (
    <>
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>{explain}</div>
      {rows.map((s, i) => {
        const isMe = s.user_id === userId;
        const bar = rule === "most" ? (rows[0].value ? (s.value / rows[0].value) * 100 : 0) : rule === "finishers" ? s.progress : s.consistency;
        const tag = rule === "finishers" ? (s.finished ? "Made it" : null) : i === 0 && s.value > 0 ? (finished ? "Winner" : "Leading") : null;
        return (
          <div key={s.user_id} className={isMe ? "" : "card"} style={{ borderRadius: 20, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, background: isMe ? "var(--soft-l)" : undefined }}>
            {rule !== "finishers" && <span className="muted" style={{ width: 18, fontSize: "var(--t-title)", fontWeight: 800 }}>{i + 1}</span>}
            <Avatar name={s.name} path={s.avatar_path} size={38} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>{isMe ? "You" : s.name}</span>
                {tag && <span className="tag tag-accent" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800, lineHeight: 1, padding: "4px 9px 4px 7px" }}><Icon name={tag === "Made it" ? "check" : "trophy"} size={14} color="var(--accent)" stroke={2.1} />{tag}</span>}
                <span style={{ marginLeft: "auto", fontSize: "var(--t-title)", fontWeight: 800 }}>{rule === "finishers" ? `${s.progress}%` : s.display}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--soft)", position: "relative" }}>
                <div style={{ width: `${Math.min(100, bar)}%`, height: 6, borderRadius: 3, background: "var(--primary)" }} />
                {rule === "finishers" && <div style={{ position: "absolute", left: `${c.finish_pct}%`, top: -3, width: 2, height: 12, background: "var(--accent)", borderRadius: 1 }} />}
              </div>
              <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span>{isV2(c) ? `${s.done} of ${s.target} sessions` : `${s.done} of ${s.target} days`}</span>
                {!c.same_goal && <span>Goal {s.goalLabel}</span>}
              </div>
              {isMe && nudge && <div className="t-tag" style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--nav-on)", fontWeight: 800 }}><Flame size={14} />{nudge}</div>}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- stats
/** The wine box at the top of a stats page: a ring, one big number, and how far into the challenge we are. */
function StatHero({ c, pct, ringLabel, big, bigLabel, extra }: { c: Challenge; pct: number; ringLabel: string; big: React.ReactNode; bigLabel: string; extra?: string }) {
  const all = totalDays(c);
  const elapsed = Math.max(0, Math.min(all, diffDays(today(), c.starts_on) + 1));
  return (
    <section style={{ padding: "18px 18px 16px", borderRadius: 24, background: "var(--hero)", color: "var(--on-hero)", display: "flex", alignItems: "center", gap: 18 }}>
      <Ring size={92} stroke={9} pct={pct} track="rgba(255, 255, 255, 0.16)" color="var(--hero-ring)">
        <span className="ring-num" style={{ fontSize: 20 }}>{pct}%</span><span style={{ fontSize: 10.5, opacity: 0.8, marginTop: 3 }}>{ringLabel}</span>
      </Ring>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div className="font-display" style={{ fontSize: "var(--t-display)", fontWeight: 600, lineHeight: 1 }}>{big}</div>
          <div className="t-sub" style={{ color: "var(--hero-ring)", fontWeight: 700, marginTop: 3 }}>{bigLabel}</div>
        </div>
        <div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255, 255, 255, 0.16)" }}><div style={{ width: `${(elapsed / all) * 100}%`, height: 5, borderRadius: 3, background: "var(--hero-ring)" }} /></div>
          <div className="t-meta" style={{ marginTop: 5, opacity: 0.85 }}>Day {elapsed} of {all}{extra ? ` · ${extra}` : ""}</div>
        </div>
      </div>
    </section>
  );
}

const factRow = (label: string, value: React.ReactNode) => (
  <div className="row"><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>{label}</div><span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800 }}>{value}</span></div>
);

/** Bars of the same width whether there are two or twenty, so a short challenge doesn't get stretched boxes. */
function Bars({ items, max }: { items: { key: string; value: number; ghost?: number; top: React.ReactNode; foot: React.ReactNode; strong?: boolean; faded?: boolean }[]; max: number }) {
  const H = 96;
  return (
    <div className="no-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto", alignItems: "flex-end", margin: "0 -16px", padding: "2px 16px 2px" }}>
      {items.map((it) => (
        <div key={it.key} style={{ width: 40, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, opacity: it.faded ? 0.45 : 1 }}>
          <span className="t-meta" style={{ fontWeight: 800 }}>{it.top}</span>
          <div style={{ width: 22, height: H, display: "flex", alignItems: "flex-end", position: "relative" }}>
            {it.ghost !== undefined && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.max(6, (it.ghost / max) * H), borderRadius: 11, background: "var(--soft)" }} />}
            <div style={{ position: "relative", width: "100%", height: it.value > 0 ? Math.max(8, (it.value / max) * H) : 0, borderRadius: 11, background: it.strong ? "var(--primary)" : "var(--primary-l)" }} />
          </div>
          {it.foot}
        </div>
      ))}
    </div>
  );
}

function SoloStats({ c, mine, weeks, checkins }: { c: Challenge; mine: Standing; weeks: WeekResult[]; checkins: CheckIn[] }) {
  const bonus = weeks.reduce((a, w) => a + w.extra, 0);
  const played = weeks.filter((w) => !w.isFuture);
  const best = played.reduce<WeekResult | null>((a, w) => (!a || w.done + w.extra > a.done + a.extra ? w : a), null);
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.target, w.done + w.extra)));
  return (
    <>
      <StatHero c={c} pct={mine.progress} ringLabel="of the goal" big={isV2(c) ? `${mine.done} of ${mine.target}` : mine.done} bigLabel={isV2(c) ? "sessions done" : "days done"} />
      {weeks.length > 0 && (
        <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>Week by week</span><span className="muted" style={{ fontSize: "var(--t-sub)" }}>sessions · light bar = the goal</span></div>
          <Bars max={max} items={weeks.map((w, i) => ({
            key: w.from, value: w.done + w.extra, ghost: w.target, strong: w.done >= w.target, faded: w.isFuture,
            top: w.isFuture ? "" : w.done + w.extra,
            foot: <span className="t-meta" style={{ fontWeight: w.isCurrent ? 800 : 600, color: w.isCurrent ? "var(--ink)" : "var(--ink-2)", whiteSpace: "nowrap" }}>{w.isCurrent ? "Now" : `W${i + 1}`}</span>,
          }))} />
        </section>
      )}
      <section className="card group">
        {factRow(mine.streakUnit === "weeks" ? "Weeks in a row" : "Days in a row", <><Flame size={16} />{mine.currentStreak}</>)}
        {factRow("Longest run", `${mine.longestStreak} ${mine.streakUnit}`)}
        {best && best.done + best.extra > 0 && factRow("Best week", `${best.done + best.extra} ${best.done + best.extra === 1 ? "session" : "sessions"} · ${formatShort(best.from)}`)}
        {factRow("On track so far", `${mine.consistency}%`)}
        {bonus > 0 && factRow("Bonus sessions", `+${bonus}`)}
        {factRow("Check-ins", checkins.length)}
        {checkins.some((x) => x.photo_path) && factRow("With a photo", checkins.filter((x) => x.photo_path).length)}
      </section>
    </>
  );
}

function GroupStats({ c, st, checkins, userId }: { c: Challenge; st: Standing[]; checkins: CheckIn[]; userId: string }) {
  const avg = st.length ? Math.round(st.reduce((a, s) => a + s.progress, 0) / st.length) : 0;
  const longest = [...st].sort((a, b) => b.longestStreak - a.longestStreak)[0];
  const most = [...st].sort((a, b) => b.checkins - a.checkins)[0];
  const photosTop = [...st].sort((a, b) => b.photos - a.photos)[0];
  const byCheckins = [...st].sort((a, b) => b.checkins - a.checkins);
  const max = Math.max(1, ...st.map((s) => s.checkins));
  const made = st.filter((s) => s.finished).length;
  const facts = [
    c.show_longest_streak && longest && longest.longestStreak > 0 && factRow("Longest streak", <><Flame size={16} />{longest.name} · {longest.longestStreak} {longest.streakUnit}</>),
    c.show_most_checkins && most && most.checkins > 0 && factRow("Most check-ins", `${most.name} · ${most.checkins}`),
    c.show_most_photos && photosTop && photosTop.photos > 0 && factRow("Most photos", `${photosTop.name} · ${photosTop.photos}`),
  ].filter(Boolean);
  return (
    <>
      <StatHero c={c} pct={avg} ringLabel="of the goal" big={checkins.length} bigLabel="total check-ins"
        extra={c.win_rule === "finishers" && isV2(c) ? `${made} of ${st.length} made it so far` : "the group together"} />
      <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>Check-ins</span><span className="muted" style={{ fontSize: "var(--t-sub)" }}>per person</span></div>
        <Bars max={max} items={byCheckins.map((s, i) => ({
          key: s.user_id, value: s.checkins, strong: i === 0 && s.checkins > 0, top: s.checkins,
          foot: <><Avatar name={s.name} path={s.avatar_path} size={30} /><span className="t-meta" style={{ fontWeight: s.user_id === userId ? 800 : 600, maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.user_id === userId ? "You" : s.name.split(" ")[0]}</span></>,
        }))} />
      </section>
      {facts.length > 0 && <section className="card group">{facts.map((f, i) => <div key={i}>{f}</div>)}</section>}
    </>
  );
}

// ---------------------------------------------------------------- chat
function Chat({ c, userId, members, onMore }: { c: Challenge; userId: string; members: Member[]; onMore: (t: SafetyTarget) => void }) {
  const { toast } = useApp();
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const names = useMemo(() => new Map(members.map((m) => [m.user_id, m.profiles])), [members]);

  useEffect(() => {
    const sb = supabase();
    sb.from("messages").select("*").eq("challenge_id", c.id).order("created_at").limit(200).then(({ data }) => setMsgs((data ?? []) as Message[]));
    const ch = sb.channel(`chat-${c.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `challenge_id=eq.${c.id}` },
        (p) => setMsgs((ms) => (ms && !ms.some((m) => m.id === (p.new as Message).id) ? [...ms, p.new as Message] : ms)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [c.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs?.length]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await supabase().from("messages").insert({ challenge_id: c.id, user_id: userId, body }).select().single();
    if (error) { setText(body); toast({ text: error.message || "Couldn't send the message. Try again." }); return; }   // the text comes back so nothing is lost
    if (data) setMsgs((ms) => (ms && !ms.some((m) => m.id === data.id) ? [...ms, data as Message] : ms));
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 6px" }}>
        {msgs === null && <div className="skeleton" style={{ height: 120 }} />}
        {msgs?.length === 0 && <div className="muted" style={{ textAlign: "center", fontSize: 14, padding: 20 }}>Say hi to the group 👋</div>}
        {msgs?.map((m, i) => {
          const mine = m.user_id === userId;
          const p = names.get(m.user_id);
          const showName = !mine && msgs[i - 1]?.user_id !== m.user_id;
          const time = new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          return mine ? (
            <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <div style={{ padding: "10px 14px", borderRadius: "18px 18px 6px 18px", background: "var(--primary)", color: "var(--on-primary)", fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
              <div className="muted" style={{ fontSize: 11 }}>{time}</div>
            </div>
          ) : (
            <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", maxWidth: "82%" }}>
              <Avatar name={p?.display_name ?? "?"} path={p?.avatar_path} size={28} />
              <div>
                {showName && <div className="muted" style={{ fontSize: 11.5, margin: "0 0 3px 10px" }}>{p?.display_name ?? "Former member"} · {time}</div>}
                {/* a tap on someone else's message opens report or block */}
                <button className="card" onClick={() => onMore({ user: m.user_id, name: p?.display_name ?? "Former member", kind: "message", id: m.id })} aria-label={`${m.body}. Report or block`}
                  style={{ display: "block", border: 0, color: "inherit", textAlign: "left", padding: "10px 14px", borderRadius: "18px 18px 18px 6px", fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</button>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{ position: "fixed", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom) + 96px)", zIndex: 25, display: "flex", justifyContent: "center", padding: "0 16px" }}>
        <div style={{ width: "100%", maxWidth: 448, display: "flex", gap: 8 }}>
          <label className="field" style={{ flex: 1, minHeight: 46, borderRadius: 23 }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Message" aria-label="Message" />
          </label>
          <button aria-label="Send" className="send-btn" style={{ width: 46, height: 46 }}><Icon name="send" size={19} /></button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- invite friends (in-app)
function InviteSheet({ open, onClose, c, userId, members, onShareLink, beforeInvite }: { open: boolean; onClose: () => void; c: Challenge; userId: string; members: Member[]; onShareLink: () => void; beforeInvite?: () => Promise<void> }) {
  const { toast } = useApp();
  const [friends, setFriends] = useState<{ id: string; display_name: string; avatar_path: string | null; shared: number }[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    myFriends(userId).then((f) => setFriends(f.filter((x) => !members.some((m) => m.user_id === x.id))));
    supabase().from("challenge_invites").select("user_id").eq("challenge_id", c.id).then(({ data }) => setSent(new Set((data ?? []).map((r: { user_id: string }) => r.user_id))));
  }, [open, userId, members, c.id]);
  async function invite(uid: string) {
    await beforeInvite?.();
    const { error } = await supabase().from("challenge_invites").insert({ challenge_id: c.id, user_id: uid, invited_by: userId });
    if (!error) { setSent((s) => new Set(s).add(uid)); toast({ text: "Invitation sent." }); }
  }
  return (
    <Sheet open={open} onClose={onClose} label="Invite friends">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="h1" style={{ fontSize: 22 }}>Invite friends</div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      {friends.length ? (
        <div className="card group">
          {friends.map((f) => (
            <div key={f.id} className="row">
              <Avatar name={f.display_name} path={f.avatar_path} size={38} />
              <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{f.display_name}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{f.shared} challenge{f.shared > 1 ? "s" : ""} together</div></div>
              {sent.has(f.id) ? <span className="muted" style={{ fontSize: 13, fontWeight: 800 }}>Invited</span>
                : <button className="btn btn-primary btn-sm" onClick={() => invite(f.id)}>Invite</button>}
            </div>
          ))}
        </div>
      ) : <div className="muted" style={{ fontSize: 14 }}>Your friends on Frejas show up here. Share the link to bring in someone who isn&apos;t on Frejas yet.</div>}
      {c.solo && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>It stays just yours until you invite someone or share the link.</div>}
      {joinClosed(c) && <div role="status" className="soft" style={{ padding: "10px 14px", borderRadius: 16, fontSize: 13.5, lineHeight: 1.4 }}><b>{joinByLabel(c)}.</b> Nobody new can join until the creator changes the last day to join in the challenge&apos;s menu.</div>}
      <button className="btn btn-soft" onClick={onShareLink}><Icon name="link" />Share a link instead</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- invited, not yet joined
function InviteView({ c, onJoined }: { c: Challenge; onJoined: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabase().rpc("get_invite", { p_token: c.invite_token }).then(({ data }) => setNames(((data as { member_names: string[] }[] | null)?.[0]?.member_names) ?? []));
  }, [c.invite_token]);
  async function accept() {
    setBusy(true);
    const { error } = await supabase().rpc("join_challenge", { p_token: c.invite_token });
    setBusy(false);
    if (error) setErr(error.message); else onJoined();
  }
  async function decline() {
    const { data: s } = await supabase().auth.getSession();
    await supabase().from("challenge_invites").delete().eq("challenge_id", c.id).eq("user_id", s.session!.user.id);
    router.replace("/challenges");
  }
  return (
    <main className="page">
      <div style={{ position: "relative", margin: "calc(-1 * (env(safe-area-inset-top) + 18px)) -20px 0" }}><Cover preset={c.cover_preset} path={c.cover_path} height={200} /></div>
      <section className="card" style={{ marginTop: -48, position: "relative", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>You&apos;re invited to</span>
        <h1 className="h1">{c.name}</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isV2(c) && <Chip>{scheduleLabel(c)}</Chip>}<Chip>{formatShort(c.starts_on)} – {formatShort(c.ends_on)}</Chip>{isV2(c) && <Chip>{winRuleLabel(c.win_rule)}</Chip>}
          {joinByLabel(c) && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: "var(--accent-bg)" }}><Icon name="clock" size={13} />{joinByLabel(c)}</span>}
        </div>
        {c.stake && <StakeLine stake={c.stake} />}
        <MembersIn names={names} />
      </section>
      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
      {joinClosed(c)
        ? <div className="soft" style={{ padding: "14px 16px", borderRadius: 20, fontSize: 14, lineHeight: 1.45 }}><b>Joining has closed.</b> The last day to join was {formatShort(c.join_by!)}. The person who made the challenge can open it again.</div>
        : <button className="btn btn-primary" disabled={busy} onClick={accept}><Icon name="check" stroke={2.4} />{busy ? "Joining…" : "Join challenge"}</button>}
      <button className="btn btn-soft" onClick={decline}>{joinClosed(c) ? "Remove the invitation" : "Not now"}</button>
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><ChallengePage id={id} /></Suspense>;
}
