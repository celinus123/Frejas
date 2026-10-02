"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Cover } from "@/components/Cover";
import { Icon } from "@/components/Icon";
import { Ring } from "@/components/Ring";
import { Avatar, Avatars, Empty } from "@/components/ui";
import { PageHead } from "@/components/PageHead";
import { supabase } from "@/lib/supabase";
import { invitePreview, loadChallenge, myChallenges, myDrafts, myInvitations, type Invitation, type InvitePreview, type MyChallenge } from "@/lib/data";
import { daysLeft, fmt, isFull, isV2, joinClosed, joinLeft, ordinal, placesLabel, scheduleLabel, sharedTotal, standings, type Standing } from "@/lib/scoring";
import { diffDays, formatShort, today } from "@/lib/dates";
import { forgetInvite, savedInvites } from "@/lib/savedInvites";
import type { Challenge } from "@/lib/types";

/** An invitation link you answered "Not now" to (remembered on this device). */
type SavedLink = InvitePreview & { token: string };
/** A challenge one of your friends runs and has opened for friends to find. */
interface Found { challenge: Challenge; by: string; preview: InvitePreview | null; requested: boolean }

interface Row extends MyChallenge {
  mine: Standing | null;
  rank: number;
  of: number;
  total: number;
  won: boolean;
  people: { name: string; path: string | null }[];
}

export default function Challenges() {
  const { userId, toast } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Challenge[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [showFinished, setShowFinished] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [found, setFound] = useState<Found[]>([]);
  const t = today();

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [mc, dr, inv] = await Promise.all([myChallenges(userId), myDrafts(userId), myInvitations(userId)]);
      setDrafts(dr);
      setInvites(inv);
      // links put aside with "Not now": still valid, and not something you joined or were invited to in the meantime
      const found = await Promise.all(savedInvites().map(async (token) => {
        const row = await invitePreview(token);
        if (!row || mc.some((x) => x.challenge.id === row.challenge_id)) { forgetInvite(token); return null; }
        return inv.some((x) => x.challenge.id === row.challenge_id) ? null : { ...row, token };
      }));
      setLinks(found.filter((x): x is SavedLink => !!x));

      // challenges your friends have opened for friends: not the ones you're in, invited to, or too late for
      const open = await supabase().from("challenges").select("*").eq("visibility", "friends").eq("status", "active").gte("ends_on", today()).limit(30);
      const others = ((open.error ? [] : open.data ?? []) as Challenge[])
        .filter((c) => c.creator_id !== userId && !mc.some((x) => x.challenge.id === c.id) && !inv.some((x) => x.challenge.id === c.id) && !joinClosed(c)).slice(0, 12);
      if (others.length) {
        const [names, reqs, previews] = await Promise.all([
          supabase().from("profiles").select("id, display_name").in("id", [...new Set(others.map((c) => c.creator_id))]),
          supabase().from("join_requests").select("challenge_id").eq("user_id", userId).in("challenge_id", others.map((c) => c.id)),
          Promise.all(others.map((c) => invitePreview(c.invite_token).catch(() => null))),
        ]);
        const nameOf = new Map(((names.data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
        const asked = new Set(((reqs.data ?? []) as { challenge_id: string }[]).map((r) => r.challenge_id));
        setFound(others.map((c, i) => ({ challenge: c, by: nameOf.get(c.creator_id) ?? "A friend", preview: previews[i], requested: asked.has(c.id) })));
      } else setFound([]);
      setRows(await Promise.all(mc.filter((x) => x.challenge.status !== "draft").map(async (x) => {
        const d = await loadChallenge(x.challenge.id);
        const st = standings(x.challenge, d.members, d.checkins);
        const i = st.findIndex((s) => s.user_id === userId);
        const mine = i >= 0 ? st[i] : null;
        const c = x.challenge;
        const won = !!mine && (c.win_rule === "finishers" && isV2(c) ? mine.finished : i === 0);
        return {
          ...x, mine, rank: i + 1, of: st.length, total: sharedTotal(c, d.checkins), won,
          people: d.members.map((m) => ({ name: m.profiles?.display_name ?? "", path: m.profiles?.avatar_path ?? null })),
        };
      })));
    } catch {
      setRows([]);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function accept(inv: Invitation) {
    setBusy(inv.challenge.id);
    const { error } = await supabase().rpc("join_challenge", { p_token: inv.challenge.invite_token });
    setBusy(null);
    if (error) { toast({ text: error.message }); return; }
    router.push(`/challenges/${inv.challenge.id}`);
  }

  async function decline(inv: Invitation) {
    setInvites((xs) => xs.filter((x) => x.challenge.id !== inv.challenge.id));
    await supabase().from("challenge_invites").delete().eq("challenge_id", inv.challenge.id).eq("user_id", userId!);
  }

  // a new challenge is started from the plus in the menu, so there is no second "New" button up here
  const header = <PageHead title="Challenges" />;
  if (!rows) return <main className="page">{header}<div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 120 }} /></main>;

  const active = rows.filter((r) => r.challenge.starts_on <= t && r.challenge.ends_on >= t);
  const upcoming = rows.filter((r) => r.challenge.starts_on > t).sort((a, b) => a.challenge.starts_on.localeCompare(b.challenge.starts_on));
  const finished = rows.filter((r) => r.challenge.ends_on < t).sort((a, b) => b.challenge.ends_on.localeCompare(a.challenge.ends_on));
  const nothing = !rows.length && !drafts.length && !invites.length && !links.length && !found.length;

  // how long an invitation can still be accepted
  const joinTag = (c: { join_by?: string | null }) => joinLeft(c) && (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, padding: "2px 9px", borderRadius: 999, background: joinClosed(c) ? "var(--soft)" : "var(--accent-bg)", fontSize: "var(--t-tag)", fontWeight: 800 }}>
      <Icon name="clock" size={12} />{joinLeft(c)}
    </div>
  );

  const activeCard = (r: Row, i: number) => {
    const c = r.challenge;
    const bg = i === 0 ? "soft" : "card";
    const legacyShared = !isV2(c) && c.goal_type === "shared";
    const pct = legacyShared ? (r.total / (c.shared_target || 1)) * 100 : r.mine?.progress ?? 0;
    let line: string;
    if (legacyShared) line = `${fmt(r.total)} of ${fmt(c.shared_target ?? 0)} ${c.unit ?? ""}`;
    else if (c.solo) line = `${r.mine?.done ?? 0} of ${r.mine?.target ?? 0} sessions`;
    else if (c.win_rule === "finishers" && isV2(c)) line = r.mine?.finished ? "You've made it" : `${r.mine?.done ?? 0} of ${r.mine?.target ?? 0} · ${r.of} in it`;
    else line = `You're ${ordinal(r.rank)} of ${r.of} · ${r.mine?.display ?? ""}`;
    return (
      <Link key={c.id} href={`/challenges/${c.id}`} className={bg}
        style={{ padding: 12, borderRadius: 24, display: "flex", alignItems: "center", gap: 14, color: "inherit", textDecoration: "none" }}>
        <Cover preset={c.cover_preset} path={c.cover_path} width={64} height={64} radius={18} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>
            {c.solo ? "Just me" : "With friends"} · {daysLeft(c)} {daysLeft(c) === 1 ? "day" : "days"} left
          </div>
          <div className="font-display" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!c.solo && <Avatars people={r.people} size={22} ring={i === 0 ? "var(--soft)" : "var(--surface)"} />}
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{line}</span>
          </div>
        </div>
        <Ring size={52} stroke={5} pct={pct} track={i === 0 ? "var(--surface)" : "var(--soft)"}>
          <span className="ring-num" style={{ fontSize: 11.5 }}>{Math.round(pct)}%</span>
        </Ring>
      </Link>
    );
  };

  return (
    <main className="page">
      {header}

      {nothing && (
        <Empty icon="trophy" title="Start with yourself" text="Set a goal just for you, like pilates 3× a week for two months. Bring friends now or later.">
          <Link href="/challenges/new" className="btn btn-primary"><Icon name="plus" />Create a challenge</Link>
        </Empty>
      )}

      {invites.length + links.length > 0 && (
        <>
          <div className="label">Invitations · {invites.length + links.length}</div>
          {invites.map((inv) => {
            const c = inv.challenge;
            return (
              <div key={c.id} className="card" style={{ padding: 14, borderRadius: 24, display: "flex", flexDirection: "column", gap: 12, border: "2px solid var(--accent-bg)" }}>
                <Link href={`/challenges/${c.id}`} style={{ display: "flex", gap: 12, alignItems: "center", color: "inherit", textDecoration: "none" }}>
                  <Cover preset={c.cover_preset} path={c.cover_path} width={56} height={56} radius={16} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                      {inv.from && <Avatar name={inv.from.display_name} path={inv.from.avatar_path} size={20} />}
                      <span><b>{inv.from?.display_name ?? "A friend"}</b> invited you</span>
                    </div>
                    <div className="font-display" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>
                      {isV2(c) ? scheduleLabel(c) : c.goal_type === "own" ? "Own goals" : "Shared goal"} · {formatShort(c.starts_on)} – {formatShort(c.ends_on)}
                    </div>
                    {joinTag(c)}
                  </div>
                </Link>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-soft btn-sm" style={{ flex: 1 }} onClick={() => decline(inv)}>{joinClosed(c) ? "Remove" : "Not now"}</button>
                  {!joinClosed(c) && <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={busy === c.id} onClick={() => accept(inv)}>
                    <Icon name="check" size={17} stroke={2.4} />{busy === c.id ? "Joining…" : "Join"}
                  </button>}
                </div>
              </div>
            );
          })}
          {links.map((l) => (
            <div key={l.token} className="card" style={{ padding: 14, borderRadius: 24, display: "flex", flexDirection: "column", gap: 12, border: "2px solid var(--accent-bg)" }}>
              <Link href={`/join/${l.token}`} style={{ display: "flex", gap: 12, alignItems: "center", color: "inherit", textDecoration: "none" }}>
                <Cover preset={l.cover_preset} width={56} height={56} radius={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}><b>{l.member_names[0] ?? "A friend"}</b> sent you a link</div>
                  <div className="font-display" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{l.name}</div>
                  <div className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>{l.frequency ? scheduleLabel(l) : "Challenge"} · {formatShort(l.starts_on)} – {formatShort(l.ends_on)}</div>
                  {joinTag(l)}
                </div>
              </Link>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-soft btn-sm" style={{ flex: 1 }} onClick={() => { forgetInvite(l.token); setLinks((xs) => xs.filter((x) => x.token !== l.token)); }}>Remove</button>
                {!joinClosed(l) && <Link href={`/join/${l.token}`} className="btn btn-primary btn-sm" style={{ flex: 1 }}><Icon name="check" size={17} stroke={2.4} />Join</Link>}
              </div>
            </div>
          ))}
        </>
      )}

      {active.length > 0 && <><div className="label">Active · {active.length}</div>{active.map(activeCard)}</>}

      {upcoming.length > 0 && (
        <>
          <div className="label">Coming up</div>
          {upcoming.map((r) => {
            const c = r.challenge;
            const n = diffDays(c.starts_on, t);
            return (
              <Link key={c.id} href={`/challenges/${c.id}`} className="card"
                style={{ padding: 12, borderRadius: 24, display: "flex", alignItems: "center", gap: 14, color: "inherit", textDecoration: "none" }}>
                <Cover preset={c.cover_preset} path={c.cover_path} width={52} height={52} radius={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>Starts {formatShort(c.starts_on)} · {isV2(c) ? scheduleLabel(c, r.me.times_per_week, r.me.goal_amount) : c.solo ? "Just me" : `${r.of} in it`}</div>
                </div>
                <div className="tag" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 10px", borderRadius: 14, background: "var(--soft)", lineHeight: 1.05 }}>
                  <span className="font-display" style={{ fontSize: 20, fontWeight: 600 }}>{n}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800 }}>{n === 1 ? "day" : "days"}</span>
                </div>
              </Link>
            );
          })}
        </>
      )}

      {found.length > 0 && (
        <>
          <div className="label">From friends · {found.length}</div>
          {found.map(({ challenge: c, by, preview, requested }) => {
            const full = !!preview && isFull(preview);
            return (
              <div key={c.id} className="card" style={{ padding: 14, borderRadius: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <Link href={`/join/${c.invite_token}`} style={{ display: "flex", gap: 12, alignItems: "center", color: "inherit", textDecoration: "none" }}>
                  <Cover preset={c.cover_preset} width={56} height={56} radius={16} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}><b>{by}</b>&apos;s challenge{preview?.member_count ? ` · ${preview.member_count} in it` : ""}</div>
                    <div className="font-display" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>{isV2(c) ? scheduleLabel(c) : "Challenge"} · {formatShort(c.starts_on)} – {formatShort(c.ends_on)}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {joinTag(c)}
                      {preview && placesLabel(preview) && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, padding: "2px 9px", borderRadius: 999, background: "var(--soft)", fontSize: "var(--t-tag)", fontWeight: 800 }}><Icon name="users" size={12} />{placesLabel(preview)}</div>}
                    </div>
                  </div>
                </Link>
                {requested ? <div className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, padding: "0 2px" }}><Icon name="clock" size={15} />Request sent. {by} lets people in.</div>
                  : full ? <div className="muted" style={{ fontSize: 13, fontWeight: 800, padding: "0 2px" }}>Full for now</div>
                  : <Link href={`/join/${c.invite_token}`} className="btn btn-primary btn-sm"><Icon name="send" size={16} stroke={2.2} />Ask to join</Link>}
              </div>
            );
          })}
        </>
      )}

      {drafts.length > 0 && (
        <>
          <div className="label">Drafts</div>
          {drafts.map((c) => (
            <Link key={c.id} href={`/challenges/new?draft=${c.id}`}
              style={{ padding: 14, borderRadius: 22, border: "2px dashed var(--primary-l)", display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>
              <Icon name="draft" size={22} color="var(--ink-2)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{c.name || "Untitled challenge"}</div>
                <div className="muted" style={{ fontSize: "var(--t-sub)" }}>{c.solo ? "Just me" : "With friends"} · not started</div>
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--primary)" }}>Continue</span>
            </Link>
          ))}
        </>
      )}

      {finished.length > 0 && (
        <>
          <button className="label" onClick={() => setShowFinished((v) => !v)} aria-expanded={showFinished}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: 0, padding: 0, width: "100%", cursor: "pointer", color: "inherit", textAlign: "left" }}>
            <span>Finished · {finished.length}</span>
            <span style={{ transform: showFinished ? "rotate(90deg)" : "none", transition: "transform .2s" }}><Icon name="right" size={16} /></span>
          </button>
          {showFinished && (
            <div className="card group">
              {finished.map((r) => (
                <Link key={r.challenge.id} href={`/challenges/${r.challenge.id}`} className="row" style={{ color: "inherit", textDecoration: "none" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{r.challenge.name}</div>
                    <div className="muted" style={{ fontSize: "var(--t-sub)" }}>
                      Ended {formatShort(r.challenge.ends_on)} · {r.challenge.solo ? `${r.mine?.done ?? 0} of ${r.mine?.target ?? 0} sessions` : r.challenge.win_rule === "finishers" && isV2(r.challenge) ? (r.won ? "You made it" : "Didn't make it this time") : `${ordinal(r.rank)} of ${r.of}`}
                    </div>
                  </div>
                  {r.won && !r.challenge.solo ? <span className="tag tag-accent" style={{ fontWeight: 800 }}>{r.challenge.win_rule === "finishers" ? "Made it" : "Winner"}</span>
                    : r.challenge.solo && r.mine?.finished ? <span className="tag tag-accent" style={{ fontWeight: 800 }}>Done</span>
                    : <Icon name="right" size={16} color="var(--ink-2)" />}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
