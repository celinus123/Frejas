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
import { ensureHabit, inviteUrl, loadChallenge, myFriends, shareLink, toggleLike } from "@/lib/data";
import { daysLeft, fmt, isV2, ordinal, scheduleLabel, standings, totalDays, weekResults, weeksLeft, winRuleLabel, type Standing } from "@/lib/scoring";
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
  const [checkin, setCheckin] = useState<{ existing?: CheckIn } | null>(params.get("checkin") ? {} : null);
  const [shareOpen, setShareOpen] = useState(params.get("created") === "1");
  const [menu, setMenu] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [habitName, setHabitName] = useState<string | undefined>();
  const [requests, setRequests] = useState<Req[]>([]);
  const [invited, setInvited] = useState(false);
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
  }, [c, userId, router]);
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
  const weeks = isV2(c) ? weekResults(c, me, myCheckins) : [];
  const thisWeek = weeks.find((w) => w.isCurrent);

  async function share() {
    const r = await shareLink(url, c!.name);
    if (r === "copied") toast({ text: "Link copied. Paste it in your group chat." });
  }
  async function makeGroup() {
    await supabase().from("challenges").update({ solo: false }).eq("id", c!.id);
    await load();
    setShareOpen(true);
  }
  async function startToday() {
    await supabase().from("challenges").update({ starts_on: t }).eq("id", c!.id);
    if (me!.habit_id) await supabase().from("habits").update({ starts_on: null }).eq("id", me!.habit_id);
    toast({ text: "It starts today. Good luck!" });
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
  async function like(ci: CheckIn) {
    const liked = !!ci.reactions?.some((r) => r.user_id === userId);
    setData((d) => d && { ...d, checkins: d.checkins.map((x) => x.id === ci.id ? { ...x, reactions: liked ? x.reactions?.filter((r) => r.user_id !== userId) : [...(x.reactions ?? []), { user_id: userId! }] } : x) });
    await toggleLike(ci.id, userId!, liked);
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
        {c.stake && group && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 16, background: "var(--accent-bg)", fontSize: 13, fontWeight: 700 }}><Icon name="coffee" size={18} color="var(--accent)" />{c.stake}</div>}
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
      <button className="soft" onClick={() => (group ? setShareOpen(true) : makeGroup())} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 24, border: 0, textAlign: "left" }}>
        <span style={{ width: 40, height: 40, borderRadius: 14, background: "var(--surface)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="users" /></span>
        <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{group ? "Invite more friends" : "Bring a friend"}</span><span className="muted" style={{ display: "block", fontSize: 12.5 }}>Invite someone before it starts</span></span>
        <Icon name="right" size={16} />
      </button>
      {isCreator && <button onClick={startToday} style={{ height: 44, border: 0, background: "none", fontSize: 14, fontWeight: 800, color: "var(--primary)" }}>Start today instead</button>}
      {sheets()}
    </main>
  );

  // ---------------------------------------------------------------- shared pieces
  const progressCard = mine && (
    <section className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 16 }}>
      <Ring size={76} stroke={8} pct={mine.progress}><span style={{ fontSize: 16, fontWeight: 800 }}>{mine.progress}%</span></Ring>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{isV2(c) ? `${mine.done} of ${mine.target} sessions` : group ? `You're ${ordinal(myIdx + 1)}` : `${mine.done} days`}</span>
          {mine.finished && <span className="tag tag-accent" style={{ fontWeight: 800 }}>Made it</span>}
        </div>
        {group && isV2(c) && c.win_rule !== "finishers" && <div className="muted" style={{ fontSize: 12.5 }}>You&apos;re {ordinal(myIdx + 1)} of {st.length} · {mine.display}</div>}
        {!group && isV2(c) && !finished && <div className="muted" style={{ fontSize: 12.5 }}>{mine.consistency >= 80 ? "On track" : "A few sessions behind — you've got this"}</div>}
        {mine.currentStreak > 0 && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700 }}><Flame size={15} />{mine.currentStreak} {mine.streakUnit} in a row</div>}
      </div>
    </section>
  );

  const weekCard = thisWeek && (
    <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15, fontWeight: 800 }}>This week</span><span style={{ fontSize: 13, fontWeight: 800 }}>{thisWeek.done} of {thisWeek.target}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(thisWeek.from, i - (weekday(thisWeek.from) - 1));
          const inRange = d >= c.starts_on && d <= c.ends_on;
          const done = myCheckins.some((x) => x.checkin_date === d);
          const planned = c.frequency === "specific_days" ? (c.days ?? []).includes(i + 1) : true;
          return (
            <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, opacity: inRange ? 1 : 0.35 }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{"MTWTFSS"[i]}</span>
              <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? "var(--primary)" : d === t ? "var(--soft-l)" : "none", color: "var(--on-primary)", border: done ? 0 : `2px ${planned ? "solid" : "dotted"} var(--soft)`, boxSizing: "border-box" }}>
                {done && <Icon name="check" size={16} stroke={2.6} />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  const weeksCard = weeks.length > 1 && (
    <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15, fontWeight: 800 }}>Week by week</span><span className="muted" style={{ fontSize: 12 }}>sessions per week</span></div>
      <div style={{ display: "flex", gap: 4 }}>
        {weeks.map((w, i) => {
          const full = w.done >= w.target && !w.isFuture;
          return <div key={i} title={`${formatShort(w.from)}: ${w.done}/${w.target}`} style={{ flex: 1, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
            background: full ? "var(--primary)" : w.done ? "var(--primary-l)" : "var(--soft-l)", color: full ? "var(--on-primary)" : "var(--ink)", outline: w.isCurrent ? "2px solid var(--primary)" : "none", outlineOffset: 1 }}>{w.isFuture ? "" : w.done}</div>;
        })}
      </div>
    </section>
  );

  const latest = (list: CheckIn[]) => list.slice(0, 30).map((ci) => {
    const liked = !!ci.reactions?.some((r) => r.user_id === userId);
    const mineCi = ci.user_id === userId;
    return (
      <div key={ci.id} className="card" style={{ padding: "10px 12px", borderRadius: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <Avatar name={ci.profiles?.display_name ?? ""} path={ci.profiles?.avatar_path} size={36} />
        <button onClick={() => mineCi && setCheckin({ existing: ci })} style={{ flex: 1, border: 0, background: "none", padding: 0, textAlign: "left", display: "flex", flexDirection: "column", gap: 2, cursor: mineCi ? "pointer" : "default" }}>
          <span className="muted" style={{ fontSize: 12 }}><b style={{ color: "var(--ink)" }}>{mineCi ? "You" : ci.profiles?.display_name}</b> · {ci.checkin_date === t ? timeAgo(ci.created_at) : formatShort(ci.checkin_date)}</span>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>{ci.title}{ci.amount ? ` · ${fmt(ci.amount)} ${c.unit ?? ""}` : ""}</span>
          {ci.comment && <span className="muted" style={{ fontSize: 12.5 }}>{ci.comment}</span>}
        </button>
        {ci.photo_path && photos[ci.photo_path] && <img src={photos[ci.photo_path]} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover" }} />}
        {group && <button aria-label={liked ? "Unlike" : "Like"} aria-pressed={liked} onClick={() => like(ci)} style={{ border: 0, background: "none", display: "flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", padding: 4 }}>
          <Icon name="heart" size={17} color={liked ? "var(--accent)" : "currentColor"} fill={liked ? "var(--flame-fill)" : "none"} />{ci.reactions?.length || ""}
        </button>}
      </div>
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

  const checkInBtn = !finished && <button className="btn btn-primary" onClick={() => setCheckin({})}><Icon name="check" stroke={2.4} />Check in</button>;

  // ---------------------------------------------------------------- just me
  if (!group) return (
    <main className="page">
      {hero}
      {result}
      {progressCard}
      {!finished && weekCard}
      {weeksCard}
      {!finished && (
        <button className="soft" onClick={makeGroup} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 24, border: 0, textAlign: "left" }}>
          <span style={{ width: 40, height: 40, borderRadius: 14, background: "var(--surface)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="users" /></span>
          <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>Make it a group challenge</span><span className="muted" style={{ display: "block", fontSize: 12.5 }}>Invite friends. Your progress so far is kept.</span></span>
          <Icon name="right" size={16} />
        </button>
      )}
      {checkInBtn}
      {myCheckins.length > 0 && <><div className="label">Your check-ins</div>{latest(myCheckins)}</>}
      {sheets()}
    </main>
  );

  // ---------------------------------------------------------------- with friends
  return (
    <main className="page" style={tab === "Chat" ? { paddingBottom: 170 } : undefined}>
      {hero}
      {isCreator && requests.map((r) => (
        <section key={r.user_id} className="card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={r.profiles?.display_name ?? "?"} path={r.profiles?.avatar_path} size={36} />
          <div style={{ flex: 1, fontSize: 13.5 }}><b>{r.profiles?.display_name ?? "Someone"}</b> wants to join</div>
          <button className="btn btn-primary btn-sm" onClick={() => approve(r, true)}>Approve</button>
          <button aria-label="Decline" onClick={() => approve(r, false)} style={{ width: 36, height: 36, borderRadius: "50%", border: 0, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={16} /></button>
        </section>
      ))}
      <div className="seg">{(["Overview", "Leaderboard", "Stats", "Chat"] as Tab[]).map((x) => <button key={x} aria-pressed={tab === x} onClick={() => setTab(x)} style={{ padding: 0 }}>{x}</button>)}</div>

      {tab === "Overview" && (
        <>
          {result}
          {progressCard}
          {!finished && weekCard}
          {checkInBtn}
          <h2 className="h2" style={{ marginTop: 14 }}>Latest</h2>
          {data.checkins.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "0 4px" }}>No check-ins yet. Be the first!</div>}
          {latest(data.checkins)}
        </>
      )}
      {tab === "Leaderboard" && <Leaderboard c={c} st={st} userId={userId!} finished={finished} />}
      {tab === "Stats" && <GroupStats c={c} st={st} checkins={data.checkins} members={data.members} />}
      {tab === "Chat" && <Chat c={c} userId={userId!} members={data.members} />}
      {sheets()}
    </main>
  );

  // ---------------------------------------------------------------- sheets (hoisted)
  function sheets() {
    return (
      <>
        {checkin && userId && (
          <CheckInSheet open onClose={() => setCheckin(null)} onSaved={() => { toast({ text: checkin.existing ? "Check-in updated." : <><b>Checked in!</b> Nice work.</> }); load(); }}
            challenge={c!} userId={userId} habitId={me!.habit_id} habitName={habitName} existing={checkin.existing ?? null} minAmount={isV2(c!) ? (c!.same_goal ? c!.min_amount : me!.goal_amount ?? c!.min_amount) : null} />
        )}
        <Sheet open={shareOpen} onClose={() => setShareOpen(false)} label="Invite friends">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 6 }}>
            {params.get("created") === "1" && <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={36} stroke={2.4} /></div>}
            <div className="h1" style={{ fontSize: 24 }}>{params.get("created") === "1" ? `${c!.name} is ready` : "Invite friends"}</div>
            <div className="muted" style={{ fontSize: 14, lineHeight: 1.45, maxWidth: 300 }}>
              {c!.join_mode === "approve" ? "Share the link. You approve everyone who asks to join." : "Anyone with the link can join."}
            </div>
          </div>
          <div className="field" style={{ paddingRight: 6 }}>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url.replace(/^https?:\/\//, "")}</span>
            <button aria-label="Copy link" onClick={async () => { await navigator.clipboard.writeText(url); toast({ text: "Link copied." }); }} style={{ width: 38, height: 38, borderRadius: 12, border: 0, background: "var(--soft-l)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="copy" size={18} /></button>
          </div>
          <button className="btn btn-primary" onClick={share}><Icon name="share" />Share link</button>
          <button className="btn btn-soft" onClick={() => { setShareOpen(false); setInviteOpen(true); }}><Icon name="users" />Invite friends on Frejas</button>
        </Sheet>
        <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} c={c!} userId={userId!} members={data!.members} onShareLink={() => { setInviteOpen(false); setShareOpen(true); }} />
        <Sheet open={menu} onClose={() => setMenu(false)} label="Challenge menu">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="h1" style={{ fontSize: 22 }}>{c!.name}</div>
            <button className="icon-btn" aria-label="Close" onClick={() => setMenu(false)}><Icon name="x" /></button>
          </div>
          <div className="card group">
            {group ? (
              <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setMenu(false); setInviteOpen(true); }}>
                <Icon name="users" color="var(--primary)" /><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Invite friends</div></button>
            ) : (
              <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setMenu(false); makeGroup(); }}>
                <Icon name="users" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Make it a group challenge</div><div className="muted" style={{ fontSize: 12 }}>Your progress so far is kept</div></div></button>
            )}
            {group && <div className="row"><Icon name="bell" color="var(--primary)" /><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Mute this challenge</div><Switch on={me!.muted} onChange={mute} label="Mute" /></div>}
            {group && isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={newLink}>
              <Icon name="shield" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Make a new invite link</div><div className="muted" style={{ fontSize: 12 }}>The old link stops working</div></div></button>}
            {!isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={leave}>
              <Icon name="logout" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Leave challenge</div><div className="muted" style={{ fontSize: 12 }}>Your check-ins stay in the group&apos;s history</div></div></button>}
            {isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={remove}>
              <Icon name="trash" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Delete challenge</div><div className="muted" style={{ fontSize: 12 }}>{group ? "For everyone. " : ""}Can&apos;t be undone.</div></div></button>}
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
  return (
    <>
      <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>{explain}</div>
      {rows.map((s, i) => {
        const isMe = s.user_id === userId;
        const bar = rule === "most" ? (rows[0].value ? (s.value / rows[0].value) * 100 : 0) : rule === "finishers" ? s.progress : s.consistency;
        const tag = rule === "finishers" ? (s.finished ? "Made it" : null) : i === 0 && s.value > 0 ? (finished ? "Winner" : "Leading") : null;
        return (
          <div key={s.user_id} className={isMe ? "" : "card"} style={{ borderRadius: 20, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, background: isMe ? "var(--soft-l)" : undefined }}>
            {rule !== "finishers" && <span className="muted" style={{ width: 18, fontSize: 15, fontWeight: 800 }}>{i + 1}</span>}
            <Avatar name={s.name} path={s.avatar_path} size={38} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{isMe ? "You" : s.name}</span>
                {tag && <span className="tag tag-accent" style={{ display: "flex", alignItems: "center", gap: 3, fontWeight: 800 }}><Icon name={tag === "Made it" ? "check" : "trophy"} size={12} color="var(--accent)" stroke={2.2} />{tag}</span>}
                <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800 }}>{rule === "finishers" ? `${s.progress}%` : s.display}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--soft)", position: "relative" }}>
                <div style={{ width: `${Math.min(100, bar)}%`, height: 6, borderRadius: 3, background: "var(--primary)" }} />
                {rule === "finishers" && <div style={{ position: "absolute", left: `${c.finish_pct}%`, top: -3, width: 2, height: 12, background: "var(--accent)", borderRadius: 1 }} />}
              </div>
              <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span>{isV2(c) ? `${s.done} of ${s.target} sessions` : `${s.done} of ${s.target} days`}</span>
                {!c.same_goal && <span>Goal {s.goalLabel}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- group stats
function GroupStats({ c, st, checkins, members }: { c: Challenge; st: Standing[]; checkins: CheckIn[]; members: Member[] }) {
  const weeks = isV2(c) ? weekResults(c, members[0], []) : [];
  const perWeek = weeks.filter((w) => !w.isFuture).map((w) => ({ w, n: checkins.filter((x) => x.checkin_date >= w.from && x.checkin_date <= w.to).length }));
  const max = Math.max(1, ...perWeek.map((p) => p.n));
  const avg = st.length ? Math.round(st.reduce((a, s) => a + s.progress, 0) / st.length) : 0;
  const tile = (v: string | number, l: string) => <div className="card" style={{ padding: 14, borderRadius: 20 }}><div className="font-display" style={{ fontSize: 24, fontWeight: 600 }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div>;
  const longest = [...st].sort((a, b) => b.longestStreak - a.longestStreak)[0];
  const most = [...st].sort((a, b) => b.checkins - a.checkins)[0];
  const photosTop = [...st].sort((a, b) => b.photos - a.photos)[0];
  const elapsed = Math.max(0, Math.min(totalDays(c), diffDays(today(), c.starts_on) + 1));
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {tile(checkins.length, "check-ins together")}
        {tile(`${avg}%`, "group progress")}
        {tile(c.win_rule === "finishers" ? `${st.filter((s) => s.finished).length} / ${st.length}` : checkins.filter((x) => x.photo_path).length, c.win_rule === "finishers" ? "made it so far" : "photos shared")}
        {tile(`${elapsed} / ${totalDays(c)}`, "days done")}
      </div>
      {perWeek.length > 0 && (
        <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15, fontWeight: 800 }}>Check-ins per week</span><span className="muted" style={{ fontSize: 12 }}>everyone together</span></div>
          <div role="img" aria-label="Check-ins per week" style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
            {perWeek.map((p, i) => <div key={i} title={`${formatShort(p.w.from)}: ${p.n}`} style={{ flex: 1, height: `${Math.max(4, (p.n / max) * 100)}%`, borderRadius: 6, background: p.w.isCurrent ? "var(--primary)" : "var(--primary-l)" }} />)}
          </div>
          <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}><span>{formatShort(perWeek[0].w.from)}</span><span>This week</span></div>
        </section>
      )}
      <section className="card group">
        {c.show_longest_streak && longest && longest.longestStreak > 0 && <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Longest streak</div><span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800 }}><Flame size={16} />{longest.name} · {longest.longestStreak} {longest.streakUnit}</span></div>}
        {c.show_most_checkins && most && most.checkins > 0 && <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Most check-ins</div><span style={{ fontSize: 14, fontWeight: 800 }}>{most.name} · {most.checkins}</span></div>}
        {c.show_most_photos && photosTop && photosTop.photos > 0 && <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Most photos</div><span style={{ fontSize: 14, fontWeight: 800 }}>{photosTop.name} · {photosTop.photos}</span></div>}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- chat
function Chat({ c, userId, members }: { c: Challenge; userId: string; members: Member[] }) {
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
    const { data } = await supabase().from("messages").insert({ challenge_id: c.id, user_id: userId, body }).select().single();
    if (data) setMsgs((ms) => (ms && !ms.some((m) => m.id === data.id) ? [...ms, data as Message] : ms));
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                <div className="card" style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 6px", fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
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
          <button aria-label="Send" disabled={!text.trim()} className="btn-primary" style={{ width: 46, height: 46, borderRadius: "50%", border: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: text.trim() ? 1 : 0.5 }}><Icon name="send" size={19} /></button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- invite friends (in-app)
function InviteSheet({ open, onClose, c, userId, members, onShareLink }: { open: boolean; onClose: () => void; c: Challenge; userId: string; members: Member[]; onShareLink: () => void }) {
  const { toast } = useApp();
  const [friends, setFriends] = useState<{ id: string; display_name: string; avatar_path: string | null; shared: number }[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    myFriends(userId).then((f) => setFriends(f.filter((x) => !members.some((m) => m.user_id === x.id))));
    supabase().from("challenge_invites").select("user_id").eq("challenge_id", c.id).then(({ data }) => setSent(new Set((data ?? []).map((r: { user_id: string }) => r.user_id))));
  }, [open, userId, members, c.id]);
  async function invite(uid: string) {
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
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{f.display_name}</div><div className="muted" style={{ fontSize: 12 }}>{f.shared} challenge{f.shared > 1 ? "s" : ""} together</div></div>
              {sent.has(f.id) ? <span className="muted" style={{ fontSize: 13, fontWeight: 800 }}>Invited</span>
                : <button className="btn btn-primary btn-sm" onClick={() => invite(f.id)}>Invite</button>}
            </div>
          ))}
        </div>
      ) : <div className="muted" style={{ fontSize: 14 }}>Friends appear here once you&apos;ve done a challenge together. Share the link to bring new people in.</div>}
      <button className="btn btn-soft" onClick={onShareLink}><Icon name="link" />Share the link instead</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- invited, not yet joined
function InviteView({ c, onJoined }: { c: Challenge; onJoined: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    const { error } = await supabase().rpc("join_challenge", { p_token: c.invite_token });
    setBusy(false);
    if (!error) onJoined();
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
        </div>
        {c.stake && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 16, background: "var(--accent-bg)", fontSize: 13, fontWeight: 700 }}><Icon name="coffee" size={18} color="var(--accent)" />{c.stake}</div>}
      </section>
      <button className="btn btn-primary" disabled={busy} onClick={accept}><Icon name="check" stroke={2.4} />{busy ? "Joining…" : "Join challenge"}</button>
      <button className="btn btn-soft" onClick={decline}>Not now</button>
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><ChallengePage id={id} /></Suspense>;
}
