"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";
import { loadFeed, myChallenges, toggleLike, type MyChallenge } from "@/lib/data";
import { signedUrls } from "@/lib/photos";
import { fmt } from "@/lib/scoring";
import { timeAgo } from "@/lib/dates";
import type { CheckIn } from "@/lib/types";

export default function Feed() {
  const { userId } = useApp();
  const [items, setItems] = useState<CheckIn[] | null>(null);
  const [chs, setChs] = useState<MyChallenge[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [photos, setPhotos] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    const [f, c] = await Promise.all([loadFeed(80), myChallenges(userId)]);
    setItems(f); setChs(c);
    setPhotos(await signedUrls("photos", f.map((x) => x.photo_path)));
  }, [userId]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);

  const names = Object.fromEntries(chs.map((c) => [c.challenge.id, c.challenge]));

  async function like(ci: CheckIn) {
    const liked = !!ci.reactions?.some((r) => r.user_id === userId);
    setItems((xs) => xs && xs.map((x) => x.id === ci.id ? { ...x, reactions: liked ? x.reactions?.filter((r) => r.user_id !== userId) : [...(x.reactions ?? []), { user_id: userId! }] } : x));
    await toggleLike(ci.id, userId!, liked);
  }

  const shown = (items ?? []).filter((x) => filter === "all" || x.challenge_id === filter);
  const cols: CheckIn[][] = [[], []];
  const heights = [0, 0];
  for (const x of shown) {
    const h = (x.photo_path ? 190 : 110) + (x.comment?.length ?? 0) * 0.4;
    const i = heights[0] <= heights[1] ? 0 : 1;
    cols[i].push(x); heights[i] += h;
  }

  const card = (x: CheckIn) => {
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
    const tag = c && <Link href={`/challenges/${c.id}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}>{c.name}</Link>;
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

  return (
    <main className="page" style={{ paddingLeft: 16, paddingRight: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <h1 className="h1">Feed</h1>
        <Link href="/profile" className="icon-btn" aria-label="People"><Icon name="users" /></Link>
      </div>
      {chs.length > 0 && (
        <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "2px 20px 6px" }}>
          <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          {chs.map((c) => <button key={c.challenge.id} className="chip" aria-pressed={filter === c.challenge.id} onClick={() => setFilter(c.challenge.id)}>{c.challenge.name}</button>)}
        </div>
      )}
      {items === null ? <div className="skeleton" style={{ height: 400 }} /> : shown.length === 0 ? (
        <Empty icon="feed" title="Nothing here yet" text="Check-ins from your challenges show up here. Private habits never do.">
          <Link href="/challenges/new" className="btn btn-primary"><Icon name="plus" />Start a challenge</Link>
        </Empty>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {cols.map((col, i) => <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>{col.map(card)}</div>)}
        </div>
      )}
    </main>
  );
}
