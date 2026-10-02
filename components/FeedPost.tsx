"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cover } from "./Cover";
import { Flame, Icon } from "./Icon";
import { Ring } from "./Ring";
import { Avatar, Sheet } from "./ui";
import { D, EMOJIS, type Emoji } from "@/lib/design";
import { MAX_COMMENT, reactMode, summary, type Person, type PostRef, type Social } from "@/lib/social";
import type { FunCard } from "@/lib/feedCards";
import { fmt } from "@/lib/scoring";
import { addDays, parse, timeAgo, today } from "@/lib/dates";
import type { Challenge, CheckIn } from "@/lib/types";
import type { SafetyTarget } from "@/lib/safety";

export interface FeedPost {
  key: string;
  ref: PostRef;
  at: string;
  authorId: string;
  ci?: CheckIn;            // a check-in…
  challenge?: Challenge;
  date?: string;           // …or a day card: the shared habits someone ticked that day
  habits?: string[];
}
export type Who = (id: string) => Person & { you: boolean };

const dayWord = (d: string) => (d === today() ? "today" : d === addDays(today(), -1) ? "yesterday" : `on ${parse(d).toLocaleDateString("en-GB", { weekday: "long" })}`);

function Picker({ mine, onPick, inline }: { mine: string | null; onPick: (e: Emoji | null) => void; inline?: boolean }) {
  return (
    <div className={inline ? "picker inline" : "picker"} role="group" aria-label="Pick a reaction">
      {EMOJIS.map((e) => (
        <button key={e} className="em" aria-pressed={mine === e} aria-label={mine === e ? `Remove ${e}` : `React with ${e}`} onClick={() => onPick(mine === e ? null : e)}>{e}</button>
      ))}
    </div>
  );
}

interface CardProps {
  post: FeedPost; uid: string; who: Who; photo?: string; social: Social;
  pickerOpen: boolean; setPicker: (open: boolean) => void; onReact: (e: Emoji | null) => void; onOpen: () => void;
}

/** One post in a feed column. Lines under a photo: title, challenge, caption, then reactions and comments. */
export function PostCard({ post, uid, who, photo, social, pickerOpen, setPicker, onReact, onOpen }: CardProps) {
  const s = summary(social);
  const mine = social.reactions.find((r) => r.user_id === uid)?.emoji ?? null;
  const author = who(post.authorId);
  const ci = post.ci, c = post.challenge;
  const mode = reactMode(post.ref);   // true: pick an emoji · "heart": plain like · false: nothing yet

  const whoRow = (on: boolean) => (
    <div className={on ? "who on" : "who"}>
      <Avatar name={author.name} path={author.path} size={D.avatar.post} />
      <b>{author.you ? "You" : author.name}</b><span>{timeAgo(post.at)}</span>
    </div>
  );
  const bubble = (on: boolean) => s.latest && (
    <button className={on ? "cmt on" : "cmt in"} onClick={onOpen} aria-label={`Comment from ${who(s.latest.user_id).name}: ${s.latest.body}. Open comments`}>
      <Avatar name={who(s.latest.user_id).name} path={who(s.latest.user_id).path} size={D.avatar.comment} />
      <span>{D.bubble.showName && <b>{who(s.latest.user_id).name} </b>}{s.latest.body}</span>
    </button>
  );
  const acts = mode !== false && (
    <div className="acts">
      <button className={mine ? "rbtn mine" : "rbtn"} aria-expanded={mode === true ? pickerOpen : undefined} aria-pressed={mode === "heart" ? !!mine : undefined}
        aria-label={mine ? (mode === true ? `Your reaction: ${mine}. Change it` : "Remove your heart") : "React"} onClick={() => (mode === true ? setPicker(!pickerOpen) : onReact(mine ? null : "❤️"))}>
        {/* always the outlined heart; it turns raspberry once you have reacted */}
        <Icon name="heart" size={D.icon.action} />
      </button>
      {s.total > 0 && <span className="sum" aria-label={`${s.total} ${s.total === 1 ? "reaction" : "reactions"}`}>{s.emojis.slice(0, 3).map((x) => <i key={x.e} className="em">{x.e}</i>)}{D.emoji.count && <span>{s.total}</span>}</span>}
      <button className="cbtn" onClick={onOpen} aria-label={social.comments.length ? `${social.comments.length} comments. Open` : "Write a comment"}>
        <Icon name="comment" size={D.icon.action} />{social.comments.length || ""}
      </button>
    </div>
  );
  const picker = pickerOpen && mode === true && <Picker mine={mine} onPick={onReact} />;

  if (post.habits) return (
    <article className="post card">
      <div className="post-body" style={{ paddingTop: "var(--card-pad)" }}>
        {whoRow(false)}
        <div className="t-text">did <b>{post.habits.length === 1 ? "a habit" : `${post.habits.length} habits`}</b> {dayWord(post.date!)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
          {post.habits.slice(0, 5).map((h) => <span key={h} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }}><Icon name="check" size={D.icon.inline} stroke={2.6} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</span></span>)}
          {post.habits.length > 5 && <span className="tag">+{post.habits.length - 5}</span>}
        </div>
        {acts}{bubble(false)}
      </div>
      {picker}
    </article>
  );

  const title = <div className="t-title">{ci!.title}{ci!.amount ? ` · ${fmt(ci!.amount)} ${c?.unit ?? ""}` : ""}</div>;
  const tag = c && c.name.trim().toLowerCase() !== ci!.title.trim().toLowerCase() && (
    <Link href={`/challenges/${c.id}`} className="post-ch t-tag"><Icon name="trophy" size={D.icon.inline} stroke={2.1} /><span>{c.name}</span></Link>
  );
  if (ci!.photo_path) return (
    <article className="post card">
      <div className="post-photo">
        <button onClick={onOpen} aria-label={`Open ${ci!.title}`} style={{ position: "absolute", inset: 0, border: 0, padding: 0, background: "none" }}>
          {photo && <img className="post-img" src={photo} alt={ci!.title} />}
        </button>
        {D.card.whoOnPhoto && whoRow(true)}
        {bubble(true)}
      </div>
      <div className="post-body">
        {!D.card.whoOnPhoto && whoRow(false)}
        {title}{tag}{ci!.comment && <div className="t-sub">{ci!.comment}</div>}{acts}
      </div>
      {picker}
    </article>
  );
  return (
    <article className="post soft">
      <div className="post-body" style={{ paddingTop: "var(--card-pad)" }}>
        {whoRow(false)}
        {ci!.comment && <div className="font-display" style={{ fontSize: "var(--t-section)", fontWeight: 500, lineHeight: 1.25 }}>{ci!.comment}</div>}
        {title}{tag}{acts}{bubble(false)}
      </div>
      {picker}
    </article>
  );
}

/** Recaps and challenge news, in the same column format as posts. */
export function Tile({ card }: { card: FunCard }) {
  const pad = { padding: "var(--card-pad)", display: "flex", flexDirection: "column", gap: 7 } as const;
  switch (card.kind) {
    case "week":
      return (
        <section className="post" style={{ ...pad, gap: 8, background: "var(--hero)", color: "var(--on-hero)" }}>
          <div className="t-meta" style={{ fontWeight: 800, color: "var(--hero-ring)" }}>Your week in review</div>
          <Ring size={58} stroke={6} pct={card.pct} track="rgba(255, 255, 255, 0.16)" color="var(--hero-ring)"><span style={{ fontSize: 13.5, fontWeight: 800 }}>{card.pct}%</span></Ring>
          <div className="font-display" style={{ fontSize: "calc(var(--t-section) + 4px)", fontWeight: 600, lineHeight: 1.1 }}>{card.pct >= 90 ? "What a week!" : card.pct >= 70 ? "Solid week." : card.pct >= 40 ? "Good going." : "Fresh start."}</div>
          <div className="t-sub" style={{ color: "inherit", opacity: 0.85 }}>{card.ticks} ticks{card.best ? ` · most often ${card.best}` : ""}{card.bonus ? ` · +${card.bonus} bonus` : ""}</div>
        </section>
      );
    case "month":
      return (
        <section className="post" style={{ ...pad, background: "var(--accent-bg)" }}>
          <div className="t-meta muted" style={{ fontWeight: 800 }}>Your {card.month}</div>
          <div className="font-display" style={{ fontSize: "calc(var(--t-section) + 8px)", fontWeight: 600, lineHeight: 1 }}>{card.pct}%</div>
          <div className="t-text">of your habits done</div>
          <div className="t-sub">{card.ticks} ticks in {card.month}</div>
        </section>
      );
    case "goal":
      return (
        <section className="post" style={{ ...pad, background: "var(--accent-bg)" }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}><Flame size={20} /></div>
          <div className="t-text"><b>{card.who.name}</b> hit the {card.monthly ? "monthly" : "weekly"} goal</div>
          <div className="t-title">{card.habit}{card.target > 1 ? ` · ${card.target}×` : ""}</div>
          <div className="t-sub">{timeAgo(card.at)}</div>
        </section>
      );
    case "leading":
      return (
        <Link href={`/challenges/${card.challenge.id}`} className="post" style={{ ...pad, background: "var(--accent-bg)" }}>
          <div style={{ position: "relative", width: D.avatar.post }}>
            <Avatar name={card.who.name} path={card.who.path} size={D.avatar.post} />
            <span style={{ position: "absolute", right: -5, bottom: -4, width: 20, height: 20, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="trophy" size={D.icon.inline} color="var(--accent)" /></span>
          </div>
          <div className="t-text"><b>{card.who.you ? "You're" : `${card.who.name} is`}</b> leading</div>
          <div className="t-title">{card.challenge.name}</div>
          <div className="t-sub">{card.value} · {card.who.you ? "keep it up" : "time to catch up?"}</div>
        </Link>
      );
    case "finished":
      return (
        <Link href={`/challenges/${card.challenge.id}`} className="post card" style={{ display: "block" }}>
          <Cover preset={card.challenge.cover_preset} path={card.challenge.cover_path} height={96} />
          <div style={pad}>
            <span className="tag tag-accent" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800 }}><Icon name="trophy" size={D.icon.inline} color="var(--accent)" />{card.you ? "Well done" : "Challenge over"}</span>
            <div className="t-title">{card.headline}</div>
            {card.sub && <div className="t-sub">{card.sub}</div>}
          </div>
        </Link>
      );
    default:
      return null;
  }
}

interface SheetProps {
  post: FeedPost; uid: string; who: Who; photo?: string; social: Social;
  onClose: () => void; onReact: (e: Emoji | null) => void; onComment: (body: string) => Promise<void>; onDelete: (id: string) => void;
  onMore?: (t: SafetyTarget) => void;   // report or block: the post's author, or the writer of a comment
}

/** A post opened: the photo large, who reacted with what, the comment thread and a box to write in. */
export function PostSheet({ post, uid, who, photo, social, onClose, onReact, onComment, onDelete, onMore }: SheetProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(true);
  const [pick, setPick] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const s = summary(social);
  const mine = social.reactions.find((r) => r.user_id === uid)?.emoji ?? null;
  const author = who(post.authorId);
  const ci = post.ci, c = post.challenge;
  const n = social.comments.length;
  const mode = reactMode(post.ref);
  useEffect(() => { if (n) endRef.current?.scrollIntoView({ block: "nearest" }); }, [n]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr(null);
    try { await onComment(body); setText(""); setShown(true); }
    catch (e) { setErr((e as Error).message || "Couldn't post the comment. Try again."); }
    setBusy(false);
  }
  const round = { width: 36, height: 36, borderRadius: "50%", border: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: photo ? "rgba(30, 8, 18, 0.45)" : "var(--soft-l)", color: photo ? "#fff" : "var(--ink)", pointerEvents: "auto" } as const;
  const close = <button onClick={onClose} aria-label="Close" style={round}><Icon name="x" size={18} stroke={2.2} /></button>;
  const more = !author.you && onMore && (
    <button aria-label="Report or block" style={round}
      onClick={() => onMore(post.ci ? { user: post.authorId, name: author.name, kind: "check_in", id: post.ci.id } : { user: post.authorId, name: author.name, kind: "day_card", day: post.date })}><Icon name="more" size={18} /></button>
  );
  const head = (on: boolean) => (
    <div className={on ? "who on" : "who"} style={on ? { padding: "14px 14px 30px", gap: 9 } : { gap: 9, padding: "16px 18px 0" }}>
      <Avatar name={author.name} path={author.path} size={34} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
        <b className="t-title" style={{ display: "block" }}>{author.you ? "You" : author.name}</b>
        <span className="t-meta" style={{ opacity: on ? 0.85 : 1, color: on ? "inherit" : "var(--ink-2)" }}>{timeAgo(post.at)}{c ? ` · ${c.name}` : ""}</span>
      </div>
      {more}{close}
    </div>
  );

  return (
    <Sheet open onClose={onClose} label="Post" bare>
      {ci?.photo_path ? (
        <div className="post-photo" style={{ flexShrink: 0 }}>{photo && <img className="post-img" src={photo} alt={ci.title} />}{head(true)}</div>
      ) : head(false)}
      <div style={{ padding: "14px 18px 6px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* the heart sits in the right corner, straight under the photo */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {ci ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h2">{ci.title}{ci.amount ? ` · ${fmt(ci.amount)} ${c?.unit ?? ""}` : ""}</div>
              {ci.comment && <div className="t-text muted" style={{ marginTop: 1 }}>{ci.comment}</div>}
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="h2">{post.habits!.length === 1 ? "A habit" : `${post.habits!.length} habits`} {dayWord(post.date!)}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{post.habits!.map((h) => <span key={h} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="check" size={D.icon.inline} stroke={2.6} />{h}</span>)}</div>
            </div>
          )}
          {mode !== false && (
            <button className={mine ? "heart-btn mine" : "heart-btn"} aria-expanded={mode === true ? pick : undefined} aria-pressed={mode === "heart" ? !!mine : undefined}
              aria-label={mine ? (mode === true ? `Your reaction: ${mine}. Change it` : "Remove your heart") : "React"}
              onClick={() => (mode === true ? setPick((v) => !v) : onReact(mine ? null : "❤️"))}><Icon name="heart" size={20} /></button>
          )}
        </div>
        {pick && mode === true && <div style={{ display: "flex", justifyContent: "flex-end" }}><Picker inline mine={mine} onPick={(e) => { onReact(e); setPick(false); }} /></div>}
        {s.total > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {s.emojis.map((x) => <button key={x.e} className="rx-chip" aria-pressed={mine === x.e} aria-label={mine === x.e ? `Remove your ${x.e}` : `React with ${x.e}`} onClick={() => onReact(mine === x.e ? null : (x.e as Emoji))}><i className="em">{x.e}</i>{x.n}</button>)}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
          <b className="t-title">{n ? `Comments · ${n}` : "No comments yet"}</b>
          {n > 0 && <button onClick={() => setShown((v) => !v)} aria-expanded={shown} className="t-meta muted" style={{ border: 0, background: "none", display: "flex", alignItems: "center", gap: 2, fontWeight: 700, padding: "6px 0 6px 10px" }}>{shown ? "Hide" : "Show"}<Icon name={shown ? "up" : "down"} size={D.icon.inline} stroke={2.2} /></button>}
        </div>
        {shown && social.comments.map((x) => {
          const p = who(x.user_id);
          return (
            <div key={x.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <Avatar name={p.name} path={p.path} size={28} />
              <div className="t-text" style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}><b>{p.you ? "You" : p.name}</b> <span className="t-meta muted">{timeAgo(x.created_at)}</span><div>{x.body}</div></div>
              {x.user_id !== uid && onMore && <button onClick={() => onMore({ user: x.user_id, name: p.name, kind: post.ref.kind === "checkin" ? "comment" : "day_comment", id: x.id })} aria-label={`Report or block: comment from ${p.name}`} className="muted" style={{ border: 0, background: "none", padding: 6, margin: -4 }}><Icon name="flag" size={D.icon.inline} stroke={2} /></button>}
              {(x.user_id === uid || post.authorId === uid) && <button onClick={() => onDelete(x.id)} aria-label="Delete comment" className="muted" style={{ border: 0, background: "none", padding: 6, margin: -4 }}><Icon name="x" size={D.icon.inline} stroke={2.2} /></button>}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ position: "sticky", bottom: 0, marginTop: "auto", background: "var(--bg)", padding: "8px 16px calc(env(safe-area-inset-bottom) + 14px)", display: "flex", flexDirection: "column", gap: 6 }}>
        {err && <div role="alert" className="t-text" style={{ fontWeight: 700 }}>{err}</div>}
        <label className="field" style={{ minHeight: 46, borderRadius: 23, paddingRight: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_COMMENT))} maxLength={MAX_COMMENT} placeholder="Add a comment" aria-label="Add a comment" style={{ fontWeight: 600 }} />
          <span className="t-meta muted" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{text.length}/{MAX_COMMENT}</span>
          <button aria-label="Send" disabled={busy} className="send-btn" style={{ width: 36, height: 36 }}><Icon name="send" size={16} /></button>
        </label>
      </form>
    </Sheet>
  );
}
