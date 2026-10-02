"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Avatar, Empty, Sheet } from "@/components/ui";
import { PostCard, PostSheet, Tile, type FeedPost, type Who } from "@/components/FeedPost";
import { PageHead } from "@/components/PageHead";
import { SafetySheet } from "@/components/Safety";
import { blockedIds, type SafetyTarget } from "@/lib/safety";
import { supabase } from "@/lib/supabase";
import { friendUrl, habitsWithViewers, loadChallenge, loadFeed, loadHabits, myChallenges, myFriends, removeFriend, shareLink, type Friend, type MyChallenge } from "@/lib/data";
import { challengeCards, friendDayCards, goalCards, recapCards, type FunCard, type Who as CardWho } from "@/lib/feedCards";
import { addComment, loadDaySocial, loadPeople, noSocial, react, refKey, removeComment, type Person, type PostRef, type Social } from "@/lib/social";
import { D, type Emoji } from "@/lib/design";
import { signedUrls } from "@/lib/photos";
import { addDays, iso, parse, today } from "@/lib/dates";
import type { CheckIn, Habit } from "@/lib/types";

type Item = { at: string; key: string; h: number; node: ReactNode };
type Tab = "all" | "challenges" | "habits" | "updates";
const TABS: [Tab, string][] = [["all", "All"], ["challenges", "Challenges"], ["habits", "Habits"], ["updates", "Updates"]];

// A notification about a comment leads here with ?post=<key>: open that post.
function PostFromLink({ onOpen }: { onOpen: (key: string) => void }) {
  const post = useSearchParams().get("post");
  useEffect(() => { if (post) onOpen(post); }, [post, onOpen]);
  return null;
}
// …and when it is closed the address goes back to plain /feed, so the same notification opens it again next time
const plainAddress = () => { if (window.location.search) window.history.replaceState(null, "", window.location.pathname); };

export default function Feed() {
  const { userId, profile, refreshProfile, toast } = useApp();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [social, setSocial] = useState<Record<string, Social>>({});
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [cards, setCards] = useState<FunCard[]>([]);
  const [chs, setChs] = useState<MyChallenge[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [tab, setTab] = useState<Tab>("all");               // what kind of thing to show
  const [sub, setSub] = useState<string | null>(null);      // one challenge, or one habit, inside that kind
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<string | null>(null);   // the post whose reaction picker is open
  const [openKey, setOpenKey] = useState<string | null>(null); // the post that is opened
  const [addOpen, setAddOpen] = useState(false);
  const [friendSheet, setFriendSheet] = useState<Friend | null>(null);
  const [safety, setSafety] = useState<SafetyTarget | null>(null);   // report or block
  const t = today();

  const load = useCallback(async () => {
    if (!userId) return;
    const d = parse(t);
    const since = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)) < addDays(t, -40) ? iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)) : addDays(t, -40);
    const [f, c, fr, mh, ml, ds, blocked] = await Promise.all([
      loadFeed(80), myChallenges(userId), myFriends(userId), loadHabits(userId),
      supabase().from("habit_logs").select("habit_id, log_date, created_at").eq("user_id", userId).gte("log_date", since),
      loadDaySocial(addDays(t, -7)), blockedIds(),
    ]);
    setChs(c); setFriends(fr);
    signedUrls("photos", f.map((x) => x.photo_path)).then(setPhotos).catch(() => {});

    // friends' shared habits and their ticks (row security only returns what they share with you)
    const ids = fr.map((x) => x.id);
    // (no filter on how they are shared: the database only hands over habits you are allowed to see, whether they are for all friends or for chosen ones)
    const fh = ids.length ? ((await supabase().from("habits").select("*").in("owner_id", ids).is("archived_at", null)).data ?? []) as Habit[] : [];
    const chosen = await habitsWithViewers(mh.map((h) => h.id));   // your own habits that chosen friends see
    const fl = fh.length ? ((await supabase().from("habit_logs").select("habit_id, log_date, created_at").in("habit_id", fh.map((h) => h.id)).gte("log_date", addDays(t, -40))).data ?? []) as { habit_id: string; log_date: string; created_at: string }[] : [];

    // a habit that counts for a challenge already shows up as a check-in, so it isn't repeated as a habit tick
    const chIds = c.map((x) => x.challenge.id);
    const linked = new Set(chIds.length ? (((await supabase().from("challenge_members").select("habit_id").in("challenge_id", chIds)).data ?? []) as { habit_id: string | null }[]).map((r) => r.habit_id) : []);
    const shared = [...mh.filter((h) => h.visibility === "friends" || chosen.has(h.id)), ...fh].filter((h) => !linked.has(h.id));

    const relevant = c.filter((x) => x.challenge.status !== "draft" && ((x.challenge.ends_on < t && x.challenge.ends_on >= addDays(t, -14)) || (x.challenge.starts_on <= t && x.challenge.ends_on >= t && !x.challenge.solo)));
    const cd = await Promise.all(relevant.map((x) => loadChallenge(x.challenge.id)));

    const whoOf = (owner: string): CardWho => owner === userId
      ? { id: owner, name: "You", path: profile?.avatar_path ?? null, you: true }
      : { id: owner, name: fr.find((x) => x.id === owner)?.display_name ?? "A friend", path: fr.find((x) => x.id === owner)?.avatar_path ?? null, you: false };
    const myLogs = (ml.data ?? []) as { habit_id: string; log_date: string; created_at: string }[];
    const byId = Object.fromEntries(c.map((x) => [x.challenge.id, x.challenge]));

    // posts: check-ins, and one card per person per day for the habits they share
    const list: FeedPost[] = f.map((ci) => ({ key: `c:${ci.id}`, ref: { kind: "checkin", id: ci.id }, at: ci.created_at, authorId: ci.user_id, ci, challenge: byId[ci.challenge_id] }));
    for (const card of friendDayCards(shared, [...myLogs, ...fl], whoOf)) {
      if (card.kind !== "friendDay") continue;
      list.push({ key: `d:${card.who.id}:${card.date}`, ref: { kind: "day", owner: card.who.id, day: card.date }, at: card.at, authorId: card.who.id, date: card.date, habits: card.habits });
    }
    const soc: Record<string, Social> = { ...ds };
    for (const ci of f) soc[`c:${ci.id}`] = { reactions: (ci.reactions ?? []).map((r) => ({ user_id: r.user_id, emoji: r.emoji ?? "❤️" })), comments: [...(ci.comments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) };

    // names: you, your friends, authors of check-ins; anyone else who wrote on a card you can see is looked up
    const known: Record<string, Person> = {};
    for (const x of fr) known[x.id] = { name: x.display_name, path: x.avatar_path };
    for (const ci of f) if (ci.profiles) known[ci.user_id] = { name: ci.profiles.display_name, path: ci.profiles.avatar_path };
    const seen = new Set<string>();
    for (const v of Object.values(soc)) { for (const r of v.reactions) seen.add(r.user_id); for (const m of v.comments) seen.add(m.user_id); }
    const unknown = [...seen].filter((id) => id !== userId && !known[id]);
    const extra = await loadPeople(unknown).catch(() => ({}));

    setPeople({ ...extra, ...known });
    setSocial(soc);
    setPosts(list);
    setCards([
      ...recapCards(mh, myLogs),
      ...goalCards([...mh, ...fh], [...myLogs, ...fl], whoOf),
      // no "… is leading" news about someone there is a block with
      ...challengeCards(cd.filter((x) => x.challenge).map((x) => ({ challenge: x.challenge!, members: x.members, checkins: x.checkins })), userId).filter((x) => !(x.kind === "leading" && blocked.has(x.who.id))),
    ]);
  }, [userId, t, profile?.avatar_path]);
  useEffect(() => { load().catch(() => setPosts((p) => p ?? [])); }, [load]);

  // stay current: check-ins, shared ticks, reactions and comments arrive live, and coming back to the app refreshes
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => load().catch(() => {}), 800); };
    const sb = supabase();
    let ch = sb.channel(`feed-${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "habit_logs" }, soon);
    for (const table of ["check_ins", "reactions", "comments", "day_reactions", "day_comments"]) ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, soon);
    ch.subscribe();
    const onVis = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { sb.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); if (timer) clearTimeout(timer); };
  }, [userId, load]);

  // a tap anywhere else closes the reaction picker
  useEffect(() => {
    if (!picker) return;
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.(".picker, .rbtn")) setPicker(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [picker]);

  const who: Who = useCallback((id: string) => id === userId
    ? { name: profile?.display_name ?? "You", path: profile?.avatar_path ?? null, you: true }
    : { ...(people[id] ?? { name: "A friend", path: null }), you: false }, [userId, profile, people]);

  const patch = (key: string, fn: (s: Social) => Social) => setSocial((all) => ({ ...all, [key]: fn(all[key] ?? noSocial) }));

  async function onReact(ref: PostRef, emoji: Emoji | null) {
    if (!userId) return;
    const key = refKey(ref);
    const before = social[key] ?? noSocial;
    const had = before.reactions.some((r) => r.user_id === userId);
    setPicker(null);
    patch(key, (s) => ({ ...s, reactions: [...s.reactions.filter((r) => r.user_id !== userId), ...(emoji ? [{ user_id: userId, emoji }] : [])] }));
    try { await react(ref, userId, emoji, had); }
    catch { patch(key, (s) => ({ ...s, reactions: before.reactions })); toast({ text: "Couldn't save your reaction. Try again." }); }
  }
  async function onComment(ref: PostRef, body: string) {
    if (!userId) return;
    const c = await addComment(ref, userId, body);
    patch(refKey(ref), (s) => ({ ...s, comments: [...s.comments, c] }));
  }
  async function onDelete(ref: PostRef, id: string) {
    const key = refKey(ref);
    const before = social[key] ?? noSocial;
    patch(key, (s) => ({ ...s, comments: s.comments.filter((x) => x.id !== id) }));
    try { await removeComment(ref, id); }
    catch { patch(key, (s) => ({ ...s, comments: before.comments })); toast({ text: "Couldn't delete the comment." }); }
  }

  async function shareFriendLink() {
    if (!profile) return;
    const r = await shareLink(friendUrl(profile.friend_code), "Frejas", `${profile.display_name} wants to be friends on Frejas`).catch(() => "copied" as const);
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

  // ---------------------------------------------------------------- the timeline: everything in two columns, newest first
  const columns = useMemo(() => {
    const items: Item[] = [];
    for (const p of posts ?? []) {
      if (p.ci ? !(tab === "all" || (tab === "challenges" && (!sub || p.ci.challenge_id === sub)))
               : !(tab === "all" || (tab === "habits" && (!sub || p.habits!.includes(sub))))) continue;
      const s = social[p.key] ?? noSocial;
      const h = p.habits ? 120 + Math.min(5, p.habits.length) * 26 : p.ci?.photo_path ? 290 : 130 + (p.ci?.comment?.length ?? 0) * 0.5;
      items.push({ at: p.at, key: p.key, h: h + (s.comments.length ? 26 : 0), node: (
        <PostCard key={p.key} post={p} uid={userId ?? ""} who={who} photo={p.ci?.photo_path ? photos[p.ci.photo_path] : undefined} social={s}
          pickerOpen={picker === p.key} setPicker={(o) => setPicker(o ? p.key : null)} onReact={(e) => onReact(p.ref, e)} onOpen={() => { setPicker(null); setOpenKey(p.key); }} />
      ) });
    }
    if (tab === "all" || tab === "updates") for (const c of cards) if (c.kind !== "friendDay") items.push({ at: c.at, key: c.id, h: c.kind === "finished" ? 200 : 170, node: <Tile key={c.id} card={c} /> });
    items.sort((a, b) => b.at.localeCompare(a.at));
    const cols: ReactNode[][] = [[], []], hs = [0, 0];
    for (const it of items) { const i = hs[0] <= hs[1] ? 0 : 1; cols[i].push(it.node); hs[i] += it.h + D.card.colGap; }
    return { cols, count: items.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, cards, social, photos, tab, sub, picker, who, userId]);

  // the second row of chips: your challenges, or the habits that show up in the feed (most frequent first)
  const subOptions: { id: string; label: string }[] = tab === "challenges"
    ? chs.filter((c) => c.challenge.status !== "draft").map((c) => ({ id: c.challenge.id, label: c.challenge.name }))
    : tab === "habits"
      ? [...(posts ?? []).flatMap((p) => p.habits ?? []).reduce((m, h) => m.set(h, (m.get(h) ?? 0) + 1), new Map<string, number>()).entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([h]) => ({ id: h, label: h }))
      : [];

  const opened = openKey ? (posts ?? []).find((p) => p.key === openKey) ?? null : null;

  return (
    <main className="page" style={{ paddingLeft: 16, paddingRight: 16 }}>
      <PageHead title="Feed" pad={4} />

      <div className="no-scrollbar" style={{ display: "flex", gap: D.avatar.friendGap, overflowX: "auto", margin: "0 -16px", padding: "4px 20px 2px" }} aria-label="Friends">
        <button onClick={() => setAddOpen(true)} style={{ border: 0, background: "none", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, width: D.avatar.friend + 6 }}>
          <span style={{ width: D.avatar.friend, height: D.avatar.friend, borderRadius: "50%", border: "2px dashed var(--primary-l)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={20} stroke={2.2} /></span>
          <span className="t-meta" style={{ fontWeight: 700 }}>Add</span>
        </button>
        {friends.map((f) => (
          <button key={f.id} onClick={() => setFriendSheet(f)} style={{ border: 0, background: "none", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, width: D.avatar.friend + 6, color: "inherit" }}>
            <Avatar name={f.display_name} path={f.avatar_path} size={D.avatar.friend} />
            <span className="t-meta" style={{ fontWeight: 700, maxWidth: D.avatar.friend + 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.display_name.split(" ")[0]}</span>
          </button>
        ))}
        {friends.length === 0 && <div className="muted" style={{ fontSize: 13, alignSelf: "center", lineHeight: 1.4, maxWidth: 220 }}>Add friends to see their check-ins and the habits they share.</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div className="no-scrollbar" role="group" aria-label="Show" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "2px 20px 6px" }}>
          {TABS.map(([id, label]) => <button key={id} className="chip" aria-pressed={tab === id} onClick={() => { setTab(id); setSub(null); setPicker(null); }}>{label}</button>)}
        </div>
        {subOptions.length > 0 && (
          <div className="no-scrollbar" role="group" aria-label={tab === "challenges" ? "Which challenge" : "Which habit"} style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -16px", padding: "2px 20px 6px" }}>
            <button className="chip chip-sub" aria-pressed={sub === null} onClick={() => setSub(null)}>{tab === "challenges" ? "All challenges" : "All habits"}</button>
            {subOptions.map((o) => <button key={o.id} className="chip chip-sub" aria-pressed={sub === o.id} onClick={() => setSub(o.id)}>{o.label}</button>)}
          </div>
        )}
      </div>

      {posts === null ? <div className="skeleton" style={{ height: 400 }} /> : columns.count === 0 ? (
        tab === "all" ? (
          <Empty icon="feed" title="Nothing here yet" text="Check-ins from your challenges, your weekly recap and what friends share show up here. Private habits never do.">
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icon name="users" />Add a friend</button>
          </Empty>
        ) : (
          <div className="muted t-text" style={{ padding: "18px 6px", textAlign: "center" }}>
            {tab === "challenges" ? (sub ? "No check-ins in this challenge yet." : "No check-ins yet. Check in to a challenge and it shows up here.")
              : tab === "habits" ? "No shared habits ticked this week. Habits set to Friends show up here when they're ticked."
                : "No updates right now. Recaps, goals reached and challenge news land here."}
          </div>
        )
      ) : (
        <div className="feed-cols">{columns.cols.map((col, i) => <div key={i} className="feed-col">{col}</div>)}</div>
      )}

      <Suspense><PostFromLink onOpen={setOpenKey} /></Suspense>
      {opened && userId && (
        <PostSheet post={opened} uid={userId} who={who} photo={opened.ci?.photo_path ? photos[opened.ci.photo_path] : undefined} social={social[opened.key] ?? noSocial}
          onClose={() => { setOpenKey(null); plainAddress(); }} onReact={(e) => onReact(opened.ref, e)} onComment={(body) => onComment(opened.ref, body)} onDelete={(id) => onDelete(opened.ref, id)}
          onMore={(x) => { setOpenKey(null); setSafety(x); }} />
      )}
      <SafetySheet target={safety} onClose={() => setSafety(null)} onBlocked={() => load().catch(() => {})} />

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} label="Add a friend">
        <div className="h1" style={{ fontSize: 24 }}>Add a friend</div>
        <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
          Send your friend link. Whoever opens it becomes your friend, so only share it with people you know.
          Friends see the habits you set to <b style={{ color: "var(--ink)" }}>Friends</b>. Check-ins stay inside each challenge, and private habits stay private.
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
            <button className="btn" style={{ background: "none", color: "var(--ink-2)", height: 40 }} onClick={() => { const f = friendSheet; setFriendSheet(null); setSafety({ user: f.id, name: f.display_name, kind: "person" }); }}>Report or block</button>
          </>
        )}
      </Sheet>
    </main>
  );
}
