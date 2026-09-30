"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Ring } from "@/components/Ring";
import { Avatars, Empty } from "@/components/ui";
import { loadChallenge, myChallenges, type MyChallenge } from "@/lib/data";
import { daysLeft, fmt, ordinal, sharedTotal, standings } from "@/lib/scoring";
import { formatShort, today } from "@/lib/dates";

interface Row extends MyChallenge { value: number; rank: number; of: number; total: number; winner: string; people: { name: string; path: string | null }[] }

export default function Challenges() {
  const { userId } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const t = today();

  useEffect(() => {
    if (!userId) return;
    myChallenges(userId).then(async (mc) => {
      setRows(await Promise.all(mc.map(async (x) => {
        const d = await loadChallenge(x.challenge.id);
        const st = standings(x.challenge, d.members, d.checkins);
        const i = st.findIndex((s) => s.user_id === userId);
        return { ...x, value: i >= 0 ? st[i].value : 0, rank: i + 1, of: st.length, total: sharedTotal(x.challenge, d.checkins), winner: st[0]?.name ?? "",
          people: d.members.map((m) => ({ name: m.profiles?.display_name ?? "", path: m.profiles?.avatar_path ?? null })) };
      })));
    }).catch(() => setRows([]));
  }, [userId]);

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <h1 className="h1">Challenges</h1>
      <Link href="/challenges/new" className="btn btn-primary btn-sm"><Icon name="plus" size={18} stroke={2.2} />New</Link>
    </div>
  );
  if (!rows) return <main className="page">{header}<div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 120 }} /></main>;

  const upcoming = rows.filter((r) => r.challenge.starts_on > t);
  const active = rows.filter((r) => r.challenge.starts_on <= t && r.challenge.ends_on >= t);
  const finished = rows.filter((r) => r.challenge.ends_on < t).reverse();

  const card = (r: Row, i: number) => {
    const c = r.challenge;
    const own = c.goal_type === "own";
    const bg = i === 0 ? "soft" : "card";
    return (
      <Link key={c.id} href={`/challenges/${c.id}`} className={bg} style={{ padding: 16, borderRadius: 24, display: "flex", alignItems: "center", gap: 14, color: "inherit", textDecoration: "none" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{own ? "Own goals" : "Shared goal"} · {c.starts_on > t ? `starts ${formatShort(c.starts_on)}` : `${daysLeft(c)} days left`}</div>
          <div className="font-display" style={{ fontSize: 21, fontWeight: 600 }}>{c.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Avatars people={r.people} size={24} ring={i === 0 ? "var(--soft)" : "var(--surface)"} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{own ? `You're ${ordinal(r.rank)}` : `${fmt(r.total)} of ${fmt(c.shared_target ?? 0)} ${c.unit ?? ""}`}</span>
          </div>
        </div>
        <Ring size={58} stroke={6} pct={own ? r.value : (r.total / (c.shared_target || 1)) * 100} track={i === 0 ? "var(--surface)" : "var(--soft)"}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>{own ? `${r.value}%` : `${Math.round((r.total / (c.shared_target || 1)) * 100)}%`}</span>
        </Ring>
      </Link>
    );
  };

  return (
    <main className="page">
      {header}
      {rows.length === 0 && (
        <Empty icon="trophy" title="Better together" text="Pick one of your habits, set a goal and share the link. Friends join with one tap.">
          <Link href="/challenges/new" className="btn btn-primary"><Icon name="plus" />Create a challenge</Link>
        </Empty>
      )}
      {active.length > 0 && <><div className="label">Active · {active.length}</div>{active.map(card)}</>}
      {upcoming.length > 0 && <><div className="label">Starting soon</div>{upcoming.map((r) => card(r, 1))}</>}
      {finished.length > 0 && (
        <>
          <div className="label">Finished</div>
          <div className="card group">
            {finished.map((r) => (
              <Link key={r.challenge.id} href={`/challenges/${r.challenge.id}`} className="row" style={{ color: "inherit", textDecoration: "none" }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{r.challenge.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{formatShort(r.challenge.ends_on)} · {r.rank === 1 ? "You won" : `${ordinal(r.rank)} of ${r.of}`}</div></div>
                {r.rank === 1 ? <span className="tag tag-accent" style={{ fontWeight: 800 }}>Winner</span> : <Icon name="right" size={16} color="var(--ink-2)" />}
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
