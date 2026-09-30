"use client";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Flame, Icon } from "@/components/Icon";
import { Ring } from "@/components/Ring";
import { Avatar, Avatars, BackBar, Sheet, Switch } from "@/components/ui";
import { CheckInSheet } from "@/components/CheckInSheet";
import { supabase } from "@/lib/supabase";
import { formatShort, timeAgo, today, addDays, diffDays } from "@/lib/dates";
import { inviteUrl, loadChallenge, shareLink, toggleLike } from "@/lib/data";
import { daysLeft, fmt, ordinal, sharedTotal, standings, totalDays } from "@/lib/scoring";
import { signedUrls } from "@/lib/photos";
import type { Challenge, CheckIn, Member } from "@/lib/types";

type Tab = "Overview" | "Leaderboard" | "Stats";

function ChallengePage({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { userId, toast } = useApp();
  const [data, setData] = useState<{ challenge: Challenge | null; members: Member[]; checkins: CheckIn[] } | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [checkin, setCheckin] = useState<{ existing?: CheckIn } | null>(params.get("checkin") ? {} : null);
  const [shareOpen, setShareOpen] = useState(params.get("created") === "1");
  const [menu, setMenu] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [habitName, setHabitName] = useState<string | undefined>();
  const t = today();

  const load = useCallback(async () => {
    const d = await loadChallenge(id);
    setData(d);
    setPhotos(await signedUrls("photos", d.checkins.slice(0, 30).map((c) => c.photo_path)));
  }, [id]);
  useEffect(() => { load().catch(() => setData({ challenge: null, members: [], checkins: [] })); }, [load]);

  const me = data?.members.find((m) => m.user_id === userId);
  useEffect(() => {
    if (me?.habit_id) supabase().from("habits").select("name").eq("id", me.habit_id).maybeSingle().then(({ data }) => setHabitName((data as { name: string } | null)?.name));
  }, [me?.habit_id]);

  const st = useMemo(() => (data?.challenge ? standings(data.challenge, data.members, data.checkins) : []), [data]);

  if (!data) return <main className="page"><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 300 }} /></main>;
  const c = data.challenge;
  if (!c || !me) return (
    <main className="page"><BackBar />
      <div className="card" style={{ padding: 24, textAlign: "center" }}><div className="h1" style={{ fontSize: 22 }}>Challenge not found</div>
        <p className="muted">It may have been deleted, or you're not a member. Ask a friend for the invite link.</p></div>
    </main>
  );

  const own = c.goal_type === "own";
  const myIdx = st.findIndex((s) => s.user_id === userId);
  const mine = st[myIdx];
  const total = sharedTotal(c, data.checkins);
  const finished = t > c.ends_on;
  const notStarted = t < c.starts_on;
  const canCheckIn = !notStarted && !finished;
  const url = inviteUrl(c.invite_token);
  const isCreator = c.creator_id === userId;

  async function share() {
    const r = await shareLink(url, c!.name);
    if (r === "copied") toast({ text: "Link copied. Paste it in your group chat." });
  }

  async function leave() {
    if (!confirm(`Leave ${c!.name}? Your check-ins stay in the group's history.`)) return;
    await supabase().from("challenge_members").delete().eq("challenge_id", c!.id).eq("user_id", userId!);
    router.replace("/challenges");
  }
  async function remove() {
    if (!confirm(`Delete ${c!.name} for everyone? All check-ins in it are removed.`)) return;
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
  async function like(ci: CheckIn) {
    const liked = !!ci.reactions?.some((r) => r.user_id === userId);
    setData((d) => d && { ...d, checkins: d.checkins.map((x) => x.id === ci.id ? { ...x, reactions: liked ? x.reactions?.filter((r) => r.user_id !== userId) : [...(x.reactions ?? []), { user_id: userId! }] } : x) });
    await toggleLike(ci.id, userId!, liked);
  }

  const box = (l: string, v: string, grow = true) => (
    <div style={{ flex: grow ? 1 : "none", width: grow ? undefined : 96, padding: "10px 12px", borderRadius: 16, background: "var(--surface)" }}>
      <div className="muted" style={{ fontSize: 11.5 }}>{l}</div><div style={{ fontSize: 13.5, fontWeight: 800 }}>{v}</div>
    </div>
  );
  const goalText = own
    ? (c.unit ? `${fmt(me.goal_amount ?? 0)} ${c.unit} / day` : "Every day")
    : `${fmt(c.shared_target ?? 0)} ${c.unit ?? "check-ins"} together`;

  const longest = [...st].sort((a, b) => b.longestStreak - a.longestStreak)[0];
  const most = [...st].sort((a, b) => b.checkins - a.checkins)[0];
  const photosTop = [...st].sort((a, b) => b.photos - a.photos)[0];

  return (
    <main className="page">
      <BackBar onBack={() => router.push("/challenges")} right={<button className="icon-btn" aria-label="More" onClick={() => setMenu(true)}><Icon name="more" /></button>} />

      <section className="soft" style={{ padding: 16, borderRadius: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ padding: "4px 10px", borderRadius: 999, background: "var(--primary)", color: "var(--on-primary)", fontSize: 12, fontWeight: 700 }}>{own ? "Own goals · % of goal" : "Shared goal"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Avatars people={data.members.map((m) => ({ name: m.profiles?.display_name ?? "", path: m.profiles?.avatar_path }))} size={28} ring="var(--soft)" />
            <button aria-label="Invite friends" onClick={() => setShareOpen(true)} style={{ width: 32, height: 32, borderRadius: "50%", border: 0, background: "var(--surface)", color: "var(--primary)", boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={16} stroke={2.4} /></button>
          </div>
        </div>
        <div><h1 className="h1">{c.name}</h1><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{formatShort(c.starts_on)} – {formatShort(c.ends_on)}</div></div>
        <div style={{ display: "flex", gap: 8 }}>{box("Goal", goalText)}{box(finished ? "Ended" : notStarted ? "Starts in" : "Days left", finished ? formatShort(c.ends_on) : notStarted ? `${diffDays(c.starts_on, t)} days` : String(daysLeft(c)), false)}</div>
        {c.stake && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 16, background: "var(--accent-bg)", fontSize: 13, fontWeight: 700 }}><Icon name="coffee" size={18} color="var(--accent)" />{c.stake}</div>}
      </section>

      <div className="seg">{(["Overview", "Leaderboard", "Stats"] as Tab[]).map((x) => <button key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>{x}</button>)}</div>

      {tab === "Overview" && (
        <>
          {finished && st[0] && (
            <section className="card" style={{ padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="trophy" size={36} color="var(--accent)" stroke={1.6} /></div>
              <div className="h1" style={{ fontSize: 26 }}>{st[0].user_id === userId ? "You won!" : `${st[0].name} wins!`}</div>
              {c.stake && st.length > 1 && <div className="muted" style={{ fontSize: 14 }}>{c.stake} · {st[st.length - 1].user_id === userId ? "that's you" : st[st.length - 1].name}</div>}
              <button className="btn btn-soft btn-sm" onClick={() => router.push("/challenges/new")}>Start a rematch</button>
            </section>
          )}
          {mine && (
            <section className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
              {own ? <Ring size={64} stroke={7} pct={mine.value}><span style={{ fontSize: 15, fontWeight: 800 }}>{mine.value}%</span></Ring>
                : <Ring size={64} stroke={7} pct={(total / (c.shared_target || 1)) * 100}><span style={{ fontSize: 13, fontWeight: 800 }}>{Math.round((total / (c.shared_target || 1)) * 100)}%</span></Ring>}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{own ? `You're ${ordinal(myIdx + 1)}` : `${fmt(total)} of ${fmt(c.shared_target ?? 0)} ${c.unit ?? "check-ins"}`}</span>
                  {st.length > 1 && st[0].user_id !== userId && st[0].value > 0 && <span className="tag tag-accent" style={{ fontWeight: 800 }}>{st[0].name} leads</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>{own ? `${mine.daysAtGoal} of ${mine.daysSoFar} days at goal` : `You added ${fmt(mine.value)} ${c.unit ?? "check-ins"}`}</div>
                <div className="muted" style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                  {c.show_longest_streak && longest?.longestStreak > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Flame size={15} />{longest.name} {longest.longestStreak}</span>}
                  {c.show_most_checkins && most?.checkins > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={15} stroke={2.2} color="var(--primary)" />{most.name} {most.checkins}</span>}
                </div>
              </div>
            </section>
          )}
          {canCheckIn && <button className="btn btn-primary" onClick={() => setCheckin({})}><Icon name="check" stroke={2.4} />Check in</button>}
          {notStarted && <div className="card muted" style={{ padding: 14, fontSize: 14, textAlign: "center" }}>Starts {formatShort(c.starts_on)}. Invite friends while you wait.</div>}

          <h2 className="h2" style={{ marginTop: 4 }}>Latest</h2>
          {data.checkins.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "0 4px" }}>No check-ins yet. Be the first!</div>}
          {data.checkins.slice(0, 30).map((ci) => {
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
                <button aria-label={liked ? "Unlike" : "Like"} aria-pressed={liked} onClick={() => like(ci)} style={{ border: 0, background: "none", display: "flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", padding: 4 }}>
                  <Icon name="heart" size={17} color={liked ? "var(--accent)" : "currentColor"} fill={liked ? "var(--flame-fill)" : "none"} />{ci.reactions?.length || ""}
                </button>
              </div>
            );
          })}
        </>
      )}

      {tab === "Leaderboard" && (
        <>
          <div className="muted" style={{ fontSize: 12.5, padding: "0 4px" }}>{own ? "Ranked by % of days each person hit their own goal." : `Ranked by how much each person added.`}</div>
          {st.map((s, i) => {
            const pct = own ? s.value : Math.min(100, (s.value / (c.shared_target || 1)) * 100);
            const isMe = s.user_id === userId;
            return (
              <div key={s.user_id} className={isMe ? "" : "card"} style={{ borderRadius: 20, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, background: isMe ? "var(--soft-l)" : undefined }}>
                <span className="muted" style={{ width: 18, fontSize: 15, fontWeight: 800 }}>{i + 1}</span>
                <Avatar name={s.name} path={s.avatar_path} size={38} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{isMe ? "You" : s.name}</span>
                    {i === 0 && s.value > 0 && <span className="tag tag-accent" style={{ display: "flex", alignItems: "center", gap: 3, fontWeight: 800 }}><Icon name="trophy" size={12} color="var(--accent)" />{finished ? "Winner" : "Leading"}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800 }}>{own ? `${s.value}%` : fmt(s.value)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--soft)" }}><div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: "var(--primary)" }} /></div>
                  <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span>{own ? `${s.daysAtGoal} of ${s.daysSoFar} days` : `${s.checkins} check-ins`}</span>
                    {own && c.unit && <span>Goal {fmt(s.goal ?? 0)} / day</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === "Stats" && (() => {
        const n = Math.min(daysLeft(c) === 0 ? totalDays(c) : totalDays(c) - daysLeft(c) + 1, 21);
        const end = t < c.ends_on ? t : c.ends_on;
        const days = Array.from({ length: n }, (_, i) => addDays(end, i - n + 1)).filter((d) => d >= c.starts_on);
        const perDay = days.map((d) => data.checkins.filter((x) => x.checkin_date === d).length);
        const max = Math.max(1, ...perDay);
        const avg = st.length ? Math.round(st.reduce((a, s) => a + (own ? s.value : 0), 0) / st.length) : 0;
        const tile = (v: string | number, l: string) => <div className="card" style={{ padding: 14, borderRadius: 20 }}><div className="font-display" style={{ fontSize: 24, fontWeight: 600 }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div>;
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {tile(data.checkins.length, "check-ins together")}
              {own ? tile(`${avg}%`, "group average") : tile(`${Math.round((total / (c.shared_target || 1)) * 100)}%`, "of the target")}
              {tile(data.checkins.filter((x) => x.photo_path).length, "photos shared")}
              {tile(`${Math.max(0, totalDays(c) - daysLeft(c))} / ${totalDays(c)}`, "days done")}
            </div>
            {days.length > 0 && (
              <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15, fontWeight: 800 }}>Check-ins per day</span><span className="muted" style={{ fontSize: 12 }}>last {days.length} days</span></div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }} role="img" aria-label="Check-ins per day">
                  {perDay.map((v, i) => <div key={i} title={`${formatShort(days[i])}: ${v}`} style={{ flex: 1, height: `${Math.max(4, (v / max) * 100)}%`, borderRadius: 5, background: i === perDay.length - 1 ? "var(--primary)" : "var(--primary-l)" }} />)}
                </div>
                <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}><span>{formatShort(days[0])}</span><span>{formatShort(days[days.length - 1])}</span></div>
              </section>
            )}
            <section className="card group">
              {c.show_longest_streak && longest && <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Longest streak</div><span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800 }}><Flame size={16} />{longest.name} · {longest.longestStreak} days</span></div>}
              {c.show_most_checkins && most && <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Most check-ins</div><span style={{ fontSize: 14, fontWeight: 800 }}>{most.name} · {most.checkins}</span></div>}
              {c.show_most_photos && photosTop && <div className="row"><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Most photos</div><span style={{ fontSize: 14, fontWeight: 800 }}>{photosTop.name} · {photosTop.photos}</span></div>}
            </section>
          </>
        );
      })()}

      {checkin && userId && (
        <CheckInSheet open onClose={() => setCheckin(null)} onSaved={() => { toast({ text: checkin.existing ? "Check-in updated." : <><b>Checked in!</b> Nice work.</> }); load(); }}
          challenge={c} userId={userId} habitId={me.habit_id} habitName={habitName} existing={checkin.existing ?? null} />
      )}

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} label="Invite friends">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 6 }}>
          {params.get("created") === "1" && <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={36} stroke={2.4} /></div>}
          <div className="h1" style={{ fontSize: 24 }}>{params.get("created") === "1" ? `${c.name} is ready` : "Invite friends"}</div>
          <div className="muted" style={{ fontSize: 14, lineHeight: 1.45, maxWidth: 300 }}>Anyone with the link can join. {own ? "They set their own goal when joining." : ""}</div>
        </div>
        <div className="field" style={{ paddingRight: 6 }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url.replace(/^https?:\/\//, "")}</span>
          <button aria-label="Copy link" onClick={async () => { await navigator.clipboard.writeText(url); toast({ text: "Link copied." }); }} style={{ width: 38, height: 38, borderRadius: 12, border: 0, background: "var(--soft-l)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="copy" size={18} /></button>
        </div>
        <button className="btn btn-primary" onClick={share}><Icon name="share" />Share link</button>
        <button className="btn btn-soft" onClick={() => { setShareOpen(false); router.replace(`/challenges/${c.id}`); }}>Done</button>
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} label="Challenge menu">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="h1" style={{ fontSize: 22 }}>{c.name}</div>
          <button className="icon-btn" aria-label="Close" onClick={() => setMenu(false)}><Icon name="x" /></button>
        </div>
        <div className="card group">
          <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setMenu(false); setShareOpen(true); }}>
            <Icon name="link" color="var(--primary)" /><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Invite friends</div></button>
          <div className="row"><Icon name="bell" color="var(--primary)" /><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Mute this challenge</div><Switch on={me.muted} onChange={mute} label="Mute" /></div>
          {isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={newLink}>
            <Icon name="shield" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Make a new invite link</div><div className="muted" style={{ fontSize: 12 }}>The old link stops working</div></div></button>}
          {!isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={leave}>
            <Icon name="logout" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Leave challenge</div><div className="muted" style={{ fontSize: 12 }}>Your check-ins stay in the group's history</div></div></button>}
          {isCreator && <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={remove}>
            <Icon name="trash" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Delete challenge</div><div className="muted" style={{ fontSize: 12 }}>For everyone. Can't be undone.</div></div></button>}
        </div>
      </Sheet>
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><ChallengePage id={id} /></Suspense>;
}
