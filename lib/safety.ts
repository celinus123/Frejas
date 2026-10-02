"use client";
import { supabase } from "./supabase";

/** Report and block (database change 014). Until it is in place these do nothing and the app works as before. */
const sb = () => supabase();

export type ReportKind = "check_in" | "comment" | "day_comment" | "day_card" | "message" | "person";
export const REASONS = [
  ["harassment", "Bullying or harassment"],
  ["hate", "Hate speech"],
  ["sexual", "Nudity or sexual content"],
  ["self_harm", "Self-harm"],
  ["spam", "Spam or a scam"],
  ["other", "Something else"],
] as const;
export type Reason = (typeof REASONS)[number][0];

/** What the sheet is about: always a person, and often one thing they posted. */
export interface SafetyTarget {
  user: string; name: string;
  kind: ReportKind;        // "person" = no particular post
  id?: string;             // the check-in, comment or message
  day?: string;            // for a day card
}
export const whatOf = (k: ReportKind) => (k === "person" ? "" : k === "check_in" || k === "day_card" ? "post" : k === "message" ? "message" : "comment");

// Everyone there is a block with, in either direction. Asked for once and kept, because most people have none.
let cache: Promise<Set<string>> | null = null;
export function blockedIds(): Promise<Set<string>> {
  cache ??= Promise.resolve(sb().rpc("blocked_ids")).then(({ data, error }) => new Set<string>(error ? [] : ((data ?? []) as string[])), () => new Set<string>());
  return cache;
}
const forget = () => { cache = null; };

export interface Blocked { id: string; display_name: string; created_at: string }
export async function myBlocks(): Promise<Blocked[]> {
  const { data, error } = await sb().rpc("my_blocks");
  return error ? [] : ((data ?? []) as Blocked[]);
}

export async function blockUser(uid: string, other: string) {
  const { error } = await sb().from("blocks").upsert({ blocker_id: uid, blocked_id: other }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
  if (error) throw new Error(/blocks/.test(error.message) ? "This isn't switched on yet. Try again in a little while." : error.message);
  forget();
  // What was between you is cleared away too, so that unblocking later doesn't quietly bring it back.
  // (The block already cuts it all off; these are tidying up, so one of them failing doesn't matter.)
  const [a, b] = uid < other ? [uid, other] : [other, uid];
  await Promise.allSettled([
    sb().from("friendships").delete().eq("user_a", a).eq("user_b", b),
    sb().from("habit_viewers").delete().eq("user_id", other),                                  // row security: only on your own habits
    sb().from("challenge_invites").delete().eq("user_id", other).eq("invited_by", uid),
    sb().from("challenge_invites").delete().eq("user_id", uid).eq("invited_by", other),
    sb().from("join_requests").delete().eq("user_id", other),                                  // row security: only for challenges you made
  ]);
}

export async function unblockUser(uid: string, other: string) {
  const { error } = await sb().from("blocks").delete().eq("blocker_id", uid).eq("blocked_id", other);
  if (error) throw error;
  forget();
}

export async function sendReport(t: SafetyTarget, reason: Reason, details: string, uid: string) {
  const id = crypto.randomUUID();
  const { error } = await sb().from("reports").insert({
    id, reporter_id: uid, kind: t.kind, reason, details: details.trim().slice(0, 500) || null,
    target_id: t.id ?? null, target_user: t.user, day: t.day ?? null,
  });
  if (error) throw new Error(/reports/.test(error.message) && !/lot of reports/.test(error.message) ? "Couldn't send the report. Write to hello@frejas.app instead." : error.message);
  // lets the people who run Frejas know by email; the report itself is already saved
  try {
    const { data } = await sb().auth.getSession();
    if (data.session) fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ id }), keepalive: true }).catch(() => {});
  } catch {}
}
