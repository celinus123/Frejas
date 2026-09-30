"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/components/AppProvider";
import { Cover } from "@/components/Cover";
import { Flame, Icon } from "@/components/Icon";
import { Ring } from "@/components/Ring";
import { Avatar, Empty, Sheet } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { friendUrl, loadChallenge, loadFeed, loadHabits, myChallenges, myFriends, removeFriend, shareLink, toggleLike, type Friend, type MyChallenge } from "@/lib/data";
import { challengeCards, friendDayCards, goalCards, recapCards, type FunCard, type Who } from "@/lib/feedCards";
import { signedUrls } from "@/lib/photos";
import { fmt } from "@/lib/scoring";
import { addDays, iso, parse, timeAgo, today } from "@/lib/dates";
import type { CheckIn, Habit } from "@/lib/types";

type Item = { kind: "checkin"; at: string; ci: CheckIn } | { kind: "card"; at: string; card: FunCard };

export default function Feed() {
  const { userId, profile, refreshProfile, toast } = useApp();
  const [items, setItems] = useState<CheckIn[] | null>(null);
  const [cards, setCards] = useState<FunCard[]>([]);
  const [chs, setChs] = useState<MyChallenge[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [friendSheet, setFriendSheet] = useState<Friend | null>(null);
  const t = today();

  const load = useCallback(async () => {
    if (!userId) return;
    const d = parse(t);
    const since = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)) < addDays(t, -40) ? iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)) : addDays(t, -40);
    const [f, c, fr, mh, ml] = await Promise.all([
      loadFeed(80), myChallenges(userId), myFriends(userId), loadHabits(userId),
      supabase().from("habit_logs").select("habit_id, log_date, created_at").eq("user_id", userId).gte("log_date", since),
    ]);
    setItems(f); setChs(c); setFriends(fr);
    setPhotos(await signedUrls("photos", f.map((x) => x.photo_path)));

    // friends' shared habits and their ticks (row security only returns what they share with you)
    const ids = fr.map((x) => x.id);
    const fh = ids.length ? ((await supabase().from("habits").select("*").in("owner_id", ids).eq("visibility", "friends").is("archived_at", null)).data ?? []) as Habit[] : [];
    const fl = fh.length ? ((await supabase().from("habit_logs").select("habit_id, log_date, created_at").in("habit_id", fh.map((h) => h.id)).gte("log_date", addDays(t, -40))).data ?? []) as { habit_id: string; log_date: string; created_at: string }[] : [];

    const relevant = c.filter((x) => x.challenge.status !== "draft" && ((x.challenge.ends_on < t && x.challenge.ends_on >= addDays(t, -14)) || (x.challenge.starts_on <= t && x.challenge.ends_on >= t && !x.challenge.solo)));
    const cd = await Promise.all(relevant.map((x) => loadChallenge(x.challenge.id)));

    const whoOf = (owner: string): Who => owner === userId
      ? { id: owner, name: "You", path: profile?.avatar_path ?? null, you: true }
      : { id: owner, name: fr.find((x) => x.id === owner)?.display_name ?? "A friend", path: fr.find((x) => x.id === owner)?.avatar_path ?? null, you: false };
    const myLogs = (ml.data ?? []) as { habit_id: string; log_date: string; created_at: string }[];
    setCards([
      ...recapCards(mh, myLogs),
      ...goalCards([...mh, ...fh], [...myLogs, ...fl], whoOf),
      ...friendDayCards(fh, fl, whoOf),
      ...challengeCards(cd.filter((x) => x.challenge).map((x) => ({ challenge: x.challenge!, members: x.members, checkins: x.checkins })), userId),
    ]);
  }, [userId, t, profile?.avatar_path]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);

  const names = Object.fromEntries(chs.map((c) => [c.challenge.id, c.challenge]));

  async function like(ci: CheckIn) {
    const liked = !!ci.reactions?.some((r) => r.user_id === userId);
    setItems((xs) => xs && xs.map((x) => x.id === ci.id ? { ...x, reactions: liked ? x.reactions?.filter((r) => r.user_id !== userId) : [...(x.reactions ?? []), { user_id: userId! }] } : x));
    await toggleLike(ci.id, userId!, liked);
  }

  async function shareFriendLink() {
    if (!profile) return;
    const r = await shareLink(friendUrl(profile.friend_code), "Frejas").catch(() => "copied" as const);
    if (r === "copied") toast({ text: "Link copied. Send it to a friend." });
  }
  async function newLink() {
    const { error } = await supabase().rpc("reset_friend_code");
    if (error) { toast({ text: error.message }); return; }
    await refreshProfile();
    toast({ text: "New link made. The old one no longer works." });
  }
  async function unfriend(f: Friend) {
    if (!userId) return;
    try { await removeFriend(userId, f.id); } catch (e) { toast({ text: (e as Error).message }); return; }
    setFriendSheet(null);
    toast({ text: f.shared ? <>Removed. You still see <b>{f.display_name}</b> in the challenges you share.</> : <><b>{f.display_name}</b> removed.</> });
    load();
  }

  // ---------------------------------------------------------------- the timeline
  const shownCheckins = (items ?? []).filter((x) => filter === "all" || x.challenge_id === filter);
  const timeline: Item[] = [
    ...shownCheckins.map((ci) => ({ kind: "checkin" as const, at: ci.created_at, ci })),
    ...(filter === "all" ? cards.map((card) => ({ kind: "card" as const, at: card.at, card })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const checkinCard = (x: CheckIn) => {
    const liked = !!x.reactions?.some((r) => r.user_id === userId);
    const c = names[x.challenge_id];
    const who = (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Avatar name={x.profiles?.display_name ?? ""} path={x.profiles?.avatar_path} size={22} />
        <span style={{ fontSize: 12, fontWeight: 800 }}>{x.user_id === userId ? "You" : x.profiles?.display_name}</span>
        <span className="muted" style={{ fontSize: 11.5 }}>{timeAgo(x.created_at)}</span>
      </div>
    );
    const meta = (
      <div className="muted" style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, fontWeight: 700 }}>
        <button aria-label={liked ? "Unlike" : "Like"} aria-pressed={liked} onClick={() => like(x)} style={{ border: 0, background: "none", padding: 0, display: "flex", alignItems: "center", gap: 4, color: "inherit" }}>
          <Icon name="heart" size={16} color={liked ? "var(--accent)" : "currentColor"} fill={liked ? "var(--flame-fill)" : "none"} />{x.reactions?.length ?? 0}
        </button>
      </div>
    );
    const tick = (s: number) => <div aria-label="Checked in" style={{ width: s, height: s, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={Math.round(s * 0.56)} stroke={2.6} /></div>;
    const title = <div style={{ fontSize: 14, fontWeight: 800 }}>{x.title}{x.amount ? ` · ${fmt(x.amount)} ${c?.unit ?? ""}` : ""}</div>;
    const tag = c && <Link href={`/challenges/${c.id}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}>{c.name}{c.solo ? " · just you" : ""}</Link>;
    if (x.photo_path) return (
      <div key={x.id} className="card" style={{ borderRadius: 22, overflow: "hidden" }}>
        <div style={{ position: "relative", background: "var(--soft)", minHeight: 120 }}>
          {photos[x.photo_path] && <img src={photos[x.photo_path]} alt={x.title} style={{ width: "100%", display: "block", maxHeight: 260, objectFit: "cover" }} />}
          <div style={{ position: "absolute", top: 8, left: 8 }}>{tick(24)}</div>
        </div>
        <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {who}{title}{x.comment && <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.35 }}>{x.comment}</div>}{tag}{meta}
        </div>
      </div>
    );
    return (
      <div key={x.id} className="soft" style={{ borderRadius: 22, padding: "14px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>{who}{tick(22)}</div>
        {x.comment && <div className="font-display" style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.3 }}>{x.comment}</div>}
        {title}{tag}{meta}
      </div>
    );
  };

  const small = (text: string) => <span className="muted" style={{ fontSize: 11.5 }}>{text}</span>;
  const funCard = (card: FunCard): ReactNode => {
    switch (card.kind) {
      case "week":
        return (
          <section key={card.id} style={{ borderRadius: 24, padding: "16px 18px", background: "var(--hero)", color: "var(--on-hero)", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--hero-ring)" }}>Your week in review</div>
              <div className="font-display" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}>{card.pct >= 90 ? "What a week!" : card.pct >= 70 ? "Solid week." : card.pct >= 40 ? "Good going." : "New week, fresh start."}</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>{card.ticks} ticks{card.best ? ` · most often ${card.best}` : ""}{card.bonus ? ` · +${card.bonus} bonus` : ""}</div>
            </div>
            <Ring size={70} stroke={7} pct={card.pct} track="rgba(255, 255, 255, 0.16)" color="var(--hero-ring)"><span style={{ fontSize: 15, fontWeight: 800 }}>{card.pct}%</span></Ring>
          </section>
        );
      case "month":
        return (
          <section key={card.id} className="soft" style={{ borderRadius: 24, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }} className="muted">Your {card.month}</div>
              <div className="font-display" style={{ fontSize: 22, fontWeight: 600 }}>{card.pct}% of your habits done</div>
              <div className="muted" style={{ fontSize: 13 }}>{card.ticks} ticks in {card.month}</div>
            </div>
            <Icon name="calendar" size={30} color="var(--primary)" />
          </section>
        );
      case "goal":
        return (
          <section key={card.id} className="card" style={{ borderRadius: 22, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Flame size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, lineHeight: 1.35 }}><b>{card.who.name}</b> hit the {card.monthly ? "monthly" : "weekly"} goal for <b>{card.habit}</b>{card.target > 1 ? ` · ${card.target}×` : ""}</div>
              {small(timeAgo(card.at))}
            </div>
            {!card.who.you && <Avatar name={card.who.name} path={card.who.path} size={30} />}
          </section>
        );
      case "friendDay":
        return (
          <section key={card.id} className="card" style={{ borderRadius: 22, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Avatar name={card.who.name} path={card.who.path} size={36} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 14 }}><b>{card.who.name}</b> did {card.habits.length === 1 ? "a habit" : `${card.habits.length} habits`} {card.date === t ? "today" : card.date === addDays(t, -1) ? "yesterday" : `on ${parse(card.date).toLocaleDateString("en-GB", { weekday: "long" })}`}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {card.habits.slice(0, 4).map((n) => <span key={n} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} stroke={2.6} />{n}</span>)}
                {card.habits.length > 4 && <span className="tag">+{card.habits.length - 4}</span>}
              </div>
            </div>
          </section>
        );
      case "finished":
        return (
          <Link key={card.id} href={`/challenges/${card.challenge.id}`} className="card" style={{ borderRadius: 24, overflow: "hidden", display: "flex", color: "inherit", textDecoration: "none" }}>
            <Cover preset={card.challenge.cover_preset} path={card.challenge.cover_path} width={96} height={110} />
            <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
              <span className="tag tag-accent" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800 }}><Icon name="trophy" size={12} color="var(--accent)" />{card.you ? "Well done" : "Challenge over"}</span>
              <div className="font-display" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{card.headline}</div>
              {card.sub && <div className="muted" style={{ fontSize: 12.5 }}>{card.sub}</div>}
            </div>
          </Link>
        );
      case "leading":
        return (
          <Link key={card.id} href={`/challenges/${card.challenge.id}`} className="soft" style={{ borderRadius: 22, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>
            <div style={{ position: "relative" }}>
              <Avatar name={card.who.name} path={card.who.path} size={40} />
              <span style={{ position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="trophy" size={12} color="var(--accent)" /></span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}><b>{card.who.you ? "You're" : `${card.who.name} is`}</b> leading <b>{card.challenge.name}</b></div>
              <div className="muted" style={{ fontSize: 12.5 }}>{card.value} · {card.who.you ? "keep it up" : "time to catch up?"}</div>
            </div>
            <Icon name="right" size={16} color="var(--ink-2)" />
          </Link>
        );
    }
  };

  // check-ins sit in two columns; full-width cards break the columns where they fall in time
  const blocks: ReactNode[] = [];
  let run: CheckIn[] = [];
  const flush = (key: string) => {
    if (!run.length) return;
    const cols: CheckIn[][] = [[], []], hs = [0, 0];
    for (const x of run) { const i = hs[0] <= hs[1] ? 0 : 1; cols[i].push(x); hs[i] += (x.photo_path ? 190 : 110) + (x.comment?.length ?? 0) * 0.4; }
    blocks.push(<div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>{cols.map((col, i) => <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>{col.map(checkinCard)}</div>)}</div>);
    run = [];
  };
  for (const it of timeline) {
    if (it.kind === "checkin") run.push(it.ci);
    else { flush(`run-${it.card.id}`); blocks.push(funCard(it.card)); }
  }
  flush("run-end");

  return (
    <main className="page" style={{ paddingLeft: 16, paddingRight: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <h1 className="h1">Feed</h1>
        <button className="btn btn-soft btn-sm" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} stroke={2.2} />Add friend</button>
      </div>

      <div className="no-scrollbar" style={{ display: "flex", gap: 14, overflowX: "auto", margin: "0 -16px", padding: "4px 20px 2px" }} aria-label="Friends">
        <button onClick={() => setAddOpen(true)} style={{ border: 0, background: "none", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, width: 56 }}>
          <span style={{ width: 52, height: 52, borderRadius: "50%", border: "2px dashed var(--primary-l)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={20} stroke={2.2} /></span>
          <span style={{ fontSize: 11.5, fontWeight: 700 }}>Add</span>
        </button>
        {friends.map((f) => (
          <button key={f.id} onClick={() => setFriendSheet(f)} style={{ border: 0, background: "none", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, width: 56, color: "inherit" }}>
            <Avatar name={f.display_name} path={f.avatar_path} size={52} />
            <span style={{ fontSize: 11.5, fontWeight: 700, maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.display_name.split(" ")[0]}</span>
          </button>
        ))}
        {friends.length === 0 && <div className="muted" style={{ fontSize: 13, alignSelf: "center", lineHeight: 1.4, maxWidth: 220 }}>Add friends to see their check-ins and the habits they share.</div>}
      </div>

      {chs.length > 0 && (
        <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "2px 20px 6px" }}>
          <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          {chs.filter((c) => c.challenge.status !== "draft").map((c) => <button key={c.challenge.id} className="chip" aria-pressed={filter === c.challenge.id} onClick={() => setFilter(c.challenge.id)}>{c.challenge.name}</button>)}
        </div>
      )}

      {items === null ? <div className="skeleton" style={{ height: 400 }} /> : timeline.length === 0 ? (
        <Empty icon="feed" title="Nothing here yet" text="Check-ins from your challenges, your weekly recap and what friends share show up here. Private habits never do.">
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icon name="users" />Add a friend</button>
        </Empty>
      ) : blocks}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} label="Add a friend">
        <div className="h1" style={{ fontSize: 24 }}>Add a friend</div>
        <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
          Send your friend link. Whoever opens it becomes your friend, so only share it with people you know.
          Friends see your check-ins and the habits you set to <b style={{ color: "var(--ink)" }}>Friends</b>. Private habits stay private.
        </p>
        {profile && <div className="field" style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", minHeight: 46 }}>{friendUrl(profile.friend_code).replace(/^https?:\/\//, "")}</div>}
        <button className="btn btn-primary" onClick={shareFriendLink}><Icon name="share" />Share my friend link</button>
        <button className="btn" style={{ background: "none", color: "var(--ink-2)", height: 40 }} onClick={newLink}>Make a new link (the old one stops working)</button>
      </Sheet>

      <Sheet open={!!friendSheet} onClose={() => setFriendSheet(null)} label="Friend">
        {friendSheet && (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
              <Avatar name={friendSheet.display_name} path={friendSheet.avatar_path} size={80} />
              <div className="h1" style={{ fontSize: 24 }}>{friendSheet.display_name}</div>
              <div className="muted" style={{ fontSize: 13.5 }}>
                {friendSheet.shared ? `${friendSheet.shared} challenge${friendSheet.shared > 1 ? "s" : ""} together` : "Friends"}{friendSheet.added && friendSheet.shared ? " · added as a friend" : ""}
              </div>
            </div>
            <Link href="/challenges/new" className="btn btn-primary" onClick={() => setFriendSheet(null)}><Icon name="trophy" />Start a challenge together</Link>
            {friendSheet.added && <button className="btn btn-soft" onClick={() => unfriend(friendSheet)}>Remove friend</button>}
            {!friendSheet.added && <p className="muted" style={{ margin: 0, fontSize: 12.5, textAlign: "center" }}>You&apos;re friends because you share a challenge.</p>}
          </>
        )}
      </Sheet>
    </main>
  );
}
