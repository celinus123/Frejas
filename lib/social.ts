"use client";
import { supabase } from "./supabase";
import type { Emoji } from "./design";
import { emojiSupported } from "./data";
import { notify } from "./push";
import { track } from "./analytics";

/** A post in the feed is either a check-in, or someone's shared habits for one day. */
export type PostRef = { kind: "checkin"; id: string } | { kind: "day"; owner: string; day: string };
export const refKey = (r: PostRef) => (r.kind === "checkin" ? `c:${r.id}` : `d:${r.owner}:${r.day}`);

export interface PostReaction { user_id: string; emoji: string }
export interface PostComment { id: string; user_id: string; body: string; created_at: string }
export interface Social { reactions: PostReaction[]; comments: PostComment[] }
export interface Person { name: string; path: string | null }
export const MAX_COMMENT = 120;
export const noSocial: Social = { reactions: [], comments: [] };

const sb = () => supabase();
const byTime = (a: PostComment, b: PostComment) => a.created_at.localeCompare(b.created_at);

// Day cards get reactions and comments with database change 009; before that they are simply shown without them.
let dayReady: boolean | null = null;
export const daySocialSupported = () => dayReady !== false;

/** Reactions and comments on day cards you can see, from `since` on. */
export async function loadDaySocial(since: string): Promise<Record<string, Social>> {
  if (dayReady === false) return {};
  const [r, c] = await Promise.all([
    sb().from("day_reactions").select("owner_id, day, user_id, emoji").gte("day", since),
    sb().from("day_comments").select("id, owner_id, day, user_id, body, created_at").gte("day", since).order("created_at"),
  ]);
  if (r.error || c.error) { dayReady = false; return {}; }
  dayReady = true;
  const out: Record<string, Social> = {};
  const at = (owner: string, day: string) => (out[`d:${owner}:${day}`] ??= { reactions: [], comments: [] });
  for (const x of (r.data ?? []) as { owner_id: string; day: string; user_id: string; emoji: string }[]) at(x.owner_id, x.day).reactions.push({ user_id: x.user_id, emoji: x.emoji });
  for (const x of (c.data ?? []) as (PostComment & { owner_id: string; day: string })[]) at(x.owner_id, x.day).comments.push({ id: x.id, user_id: x.user_id, body: x.body, created_at: x.created_at });
  return out;
}

/** Can this post be reacted to with a choice of emoji (true), with a plain heart ("heart"), or not at all yet (false)? */
export const reactMode = (ref: PostRef): true | "heart" | false =>
  ref.kind === "day" ? daySocialSupported() : emojiSupported() ? true : "heart";

/** Set, change or remove (emoji = null) your reaction. `had` = you already had one on this post. */
export async function react(ref: PostRef, uid: string, emoji: Emoji | null, had: boolean) {
  const table = ref.kind === "checkin" ? "reactions" : "day_reactions";
  const key: Record<string, string> = ref.kind === "checkin" ? { check_in_id: ref.id, user_id: uid } : { owner_id: ref.owner, day: ref.day, user_id: uid };
  const q = emoji === null ? sb().from(table).delete().match(key)
    : had ? sb().from(table).update({ emoji }).match(key)
      : sb().from(table).insert(ref.kind === "checkin" && !emojiSupported() ? key : { ...key, emoji });
  const { error } = await q;
  if (error) throw error;
  if (emoji !== null && !had) track("reaction_added", { on: ref.kind });
}

export async function addComment(ref: PostRef, uid: string, body: string): Promise<PostComment> {
  const text = body.trim().slice(0, MAX_COMMENT);
  const q = ref.kind === "checkin"
    ? sb().from("comments").insert({ check_in_id: ref.id, user_id: uid, body: text })
    : sb().from("day_comments").insert({ owner_id: ref.owner, day: ref.day, user_id: uid, body: text });
  const { data, error } = await q.select("id, user_id, body, created_at").single();
  if (error) throw error;
  notify({ type: "comment", on: ref.kind === "checkin" ? "checkin" : "day", id: (data as PostComment).id });
  track("comment_written", { on: ref.kind });
  return data as PostComment;
}

export async function removeComment(ref: PostRef, id: string) {
  const { error } = await sb().from(ref.kind === "checkin" ? "comments" : "day_comments").delete().eq("id", id);
  if (error) throw error;
}

/** Names of people who wrote or reacted on posts you can see but who aren't your own friends. */
export async function loadPeople(ids: string[]): Promise<Record<string, Person>> {
  if (!ids.length) return {};
  const { data } = await sb().rpc("post_people", { p_ids: ids });
  const out: Record<string, Person> = {};
  for (const p of (data ?? []) as { id: string; display_name: string; avatar_path: string | null }[]) out[p.id] = { name: p.display_name, path: p.avatar_path };
  return out;
}

/** The emoji a post has, most used first, and the newest comment. */
export function summary(s: Social) {
  const count = new Map<string, number>();
  for (const r of s.reactions) count.set(r.emoji, (count.get(r.emoji) ?? 0) + 1);
  return { emojis: [...count.entries()].sort((a, b) => b[1] - a[1]).map(([e, n]) => ({ e, n })), total: s.reactions.length, latest: [...s.comments].sort(byTime).at(-1) ?? null };
}
