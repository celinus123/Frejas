"use client";
import { supabase } from "./supabase";
import type { Challenge, CheckIn, Habit, HabitLog, Member } from "./types";
import { iso, today } from "./dates";
import { nativeShare } from "./native";

const sb = () => supabase();

// check_ins reaches profiles two ways (the author, and everyone who reacted), so the author link has to be named.
const CHECKIN_BASE = "*, profiles!check_ins_user_id_fkey(display_name, avatar_path), comments(id, user_id, body, created_at)";

// Reactions with a choice of emoji arrive with database change 009. Until it is in place the app
// works with plain hearts, so the app and the database don't have to be updated at the same moment.
let emojiReady: boolean | null = null;
export const emojiSupported = () => emojiReady !== false;
type Rows = { data: unknown[] | null; error: { message: string } | null };
async function selectCheckIns(apply: (select: string) => PromiseLike<Rows>): Promise<Rows> {
  if (emojiReady !== false) {
    const r = await apply(`${CHECKIN_BASE}, reactions(user_id, emoji)`);
    if (!r.error) { emojiReady = true; return r; }
    emojiReady = false;
  }
  return apply(`${CHECKIN_BASE}, reactions(user_id)`);
}

export async function loadHabits(uid: string, includeArchived = false): Promise<Habit[]> {
  let q = sb().from("habits").select("*").eq("owner_id", uid).order("created_at");
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return data as Habit[];
}

export async function loadLogs(uid: string, from: string, to: string): Promise<HabitLog[]> {
  const { data, error } = await sb().from("habit_logs").select("id, habit_id, user_id, log_date")
    .eq("user_id", uid).gte("log_date", from).lte("log_date", to);
  if (error) throw error;
  return data as HabitLog[];
}

export async function logHabit(habitId: string, uid: string, date: string): Promise<HabitLog> {
  const { data, error } = await sb().from("habit_logs")
    .upsert({ habit_id: habitId, user_id: uid, log_date: date }, { onConflict: "habit_id,log_date", ignoreDuplicates: true })
    .select().maybeSingle();
  if (error) throw error;
  if (data) return data as HabitLog;
  const { data: existing, error: e2 } = await sb().from("habit_logs").select("*").eq("habit_id", habitId).eq("log_date", date).single();
  if (e2) throw e2;
  return existing as HabitLog;
}

export async function unlogHabit(logId: string) {
  await sb().from("check_ins").delete().eq("habit_log_id", logId);
  const { error } = await sb().from("habit_logs").delete().eq("id", logId);
  if (error) throw error;
}

/** Removes the tick a habit has on a given day, if there is one. */
export async function unlogHabitOn(habitId: string, date: string) {
  const { data } = await sb().from("habit_logs").select("id").eq("habit_id", habitId).eq("log_date", date).maybeSingle();
  if (data) await unlogHabit((data as { id: string }).id);
}

/** Two habits kept as a pair ("tick them together"). Any earlier pair either of them had is ended first. */
export async function pairHabits(a: Pick<Habit, "id" | "linked_habit_id">, b: Pick<Habit, "id" | "linked_habit_id">) {
  for (const [h, other] of [[a, b], [b, a]] as const)
    if (h.linked_habit_id && h.linked_habit_id !== other.id) await sb().from("habits").update({ linked_habit_id: null }).eq("id", h.linked_habit_id);
  const r1 = await sb().from("habits").update({ linked_habit_id: b.id }).eq("id", a.id);
  if (r1.error) throw r1.error;
  const r2 = await sb().from("habits").update({ linked_habit_id: a.id }).eq("id", b.id);
  if (r2.error) throw r2.error;
}
export async function unpairHabit(h: Pick<Habit, "id" | "linked_habit_id">) {
  if (h.linked_habit_id) await sb().from("habits").update({ linked_habit_id: null }).eq("id", h.linked_habit_id);
  const { error } = await sb().from("habits").update({ linked_habit_id: null }).eq("id", h.id);
  if (error) throw error;
}

export interface MyChallenge { challenge: Challenge; me: Member }

export async function myChallenges(uid: string): Promise<MyChallenge[]> {
  const { data, error } = await sb().from("challenge_members").select("*, challenges(*)").eq("user_id", uid);
  if (error) throw error;
  return (data as (Member & { challenges: Challenge })[])
    .filter((r) => r.challenges)
    .map(({ challenges, ...me }) => ({ challenge: challenges, me }))
    .sort((a, b) => a.challenge.ends_on.localeCompare(b.challenge.ends_on));
}

export const isActive = (c: Challenge) => c.status !== "draft" && c.starts_on <= today() && c.ends_on >= today();

/** Drafts are only the creator's; they have no members yet. */
export async function myDrafts(uid: string): Promise<Challenge[]> {
  const { data } = await sb().from("challenges").select("*").eq("creator_id", uid).eq("status", "draft").order("created_at", { ascending: false });
  return (data ?? []) as Challenge[];
}

export interface Invitation { challenge: Challenge; from: { display_name: string; avatar_path: string | null } | null }

export async function myInvitations(uid: string): Promise<Invitation[]> {
  const { data } = await sb().from("challenge_invites").select("challenge_id, invited_by, challenges(*)").eq("user_id", uid);
  const rows = (data ?? []) as unknown as { challenge_id: string; invited_by: string; challenges: Challenge | null }[];
  const ids = [...new Set(rows.map((r) => r.invited_by))];
  const { data: ps } = ids.length ? await sb().from("profiles").select("id, display_name, avatar_path").in("id", ids) : { data: [] };
  const byId = new Map((ps ?? []).map((p: { id: string; display_name: string; avatar_path: string | null }) => [p.id, p]));
  return rows.filter((r) => r.challenges).map((r) => ({ challenge: r.challenges!, from: byId.get(r.invited_by) ?? null }));
}

export interface Friend { id: string; display_name: string; avatar_path: string | null; shared: number; added: boolean }

/** Friends = people you share a challenge with, plus people you've added with a friend link. */
export async function myFriends(uid: string): Promise<Friend[]> {
  const map = new Map<string, Friend>();
  const mine = await myChallenges(uid);
  const ids = mine.map((m) => m.challenge.id);
  const [co, fr] = await Promise.all([
    ids.length ? sb().from("challenge_members").select("user_id, profiles(display_name, avatar_path)").in("challenge_id", ids).neq("user_id", uid) : Promise.resolve({ data: [] }),
    sb().from("friendships").select("user_a, user_b"),
  ]);
  for (const r of (co.data ?? []) as unknown as { user_id: string; profiles: { display_name: string; avatar_path: string | null } | null }[]) {
    const p = map.get(r.user_id) ?? { id: r.user_id, display_name: r.profiles?.display_name ?? "", avatar_path: r.profiles?.avatar_path ?? null, shared: 0, added: false };
    p.shared++; map.set(r.user_id, p);
  }
  const addedIds = ((fr.data ?? []) as { user_a: string; user_b: string }[]).map((f) => (f.user_a === uid ? f.user_b : f.user_a));
  const missing = addedIds.filter((id) => !map.has(id));
  if (missing.length) {
    const { data } = await sb().from("profiles").select("id, display_name, avatar_path").in("id", missing);
    for (const p of (data ?? []) as { id: string; display_name: string; avatar_path: string | null }[]) map.set(p.id, { ...p, shared: 0, added: true });
  }
  for (const id of addedIds) { const f = map.get(id); if (f) f.added = true; }
  return [...map.values()].sort((a, b) => b.shared - a.shared || a.display_name.localeCompare(b.display_name));
}

export async function removeFriend(uid: string, other: string) {
  const [a, b] = uid < other ? [uid, other] : [other, uid];
  const { error } = await sb().from("friendships").delete().eq("user_a", a).eq("user_b", b);
  if (error) throw error;
}

export const friendUrl = (code: string) => `${window.location.origin}/add/${code}`;

/** Makes sure a member has a habit on Today for this challenge (e.g. after being approved). */
export async function ensureHabit(c: Challenge, m: Member, uid: string): Promise<string | null> {
  if (m.habit_id || !c.frequency) return m.habit_id;
  const times = c.same_goal ? c.times_per_week : m.times_per_week ?? c.times_per_week;
  const { data, error } = await sb().from("habits").insert({
    owner_id: uid, name: c.name.slice(0, 60), frequency: c.frequency, days: c.frequency === "specific_days" ? c.days : null,
    times_per_week: c.frequency === "times_per_week" ? times : null, starts_on: c.starts_on > today() ? c.starts_on : null, from_challenge: c.id,
  }).select("id").single();
  if (error || !data) return null;
  await sb().from("challenge_members").update({ habit_id: data.id }).eq("challenge_id", c.id).eq("user_id", uid);
  return data.id as string;
}

export async function loadChallenge(id: string) {
  const [c, m, ci] = await Promise.all([
    sb().from("challenges").select("*").eq("id", id).maybeSingle(),
    sb().from("challenge_members").select("*, profiles(display_name, avatar_path)").eq("challenge_id", id).order("joined_at"),
    selectCheckIns((sel) => sb().from("check_ins").select(sel).eq("challenge_id", id).order("created_at", { ascending: false })),
  ]);
  if (c.error) throw c.error;
  if (m.error) throw m.error;
  if (ci.error) throw ci.error;
  return { challenge: c.data as Challenge | null, members: (m.data ?? []) as Member[], checkins: (ci.data ?? []) as CheckIn[] };
}

/**
 * Ticks you already made on the linked habit, inside the challenge dates, become check-ins.
 * Used when a challenge starts in the past or its start date is moved earlier. Skipped when a check-in needs an amount.
 */
export async function backfillCheckins(c: Pick<Challenge, "id" | "starts_on" | "ends_on" | "unit">, habitId: string, uid: string): Promise<number> {
  if (c.unit) return 0;
  const to = today() < c.ends_on ? today() : c.ends_on;
  if (to < c.starts_on) return 0;
  const [logs, cis, habit] = await Promise.all([
    sb().from("habit_logs").select("id, log_date, created_at").eq("habit_id", habitId).gte("log_date", c.starts_on).lte("log_date", to),
    sb().from("check_ins").select("checkin_date").eq("challenge_id", c.id).eq("user_id", uid),
    sb().from("habits").select("name").eq("id", habitId).maybeSingle(),
  ]);
  if (logs.error) throw logs.error;
  const have = new Set(((cis.data ?? []) as { checkin_date: string }[]).map((x) => x.checkin_date));
  const rows = ((logs.data ?? []) as { id: string; log_date: string; created_at: string }[]).filter((l) => !have.has(l.log_date))
    .map((l) => ({ challenge_id: c.id, user_id: uid, habit_log_id: l.id, checkin_date: l.log_date, title: (habit.data as { name: string } | null)?.name ?? "Done", created_at: l.created_at }));
  if (!rows.length) return 0;
  const { error } = await sb().from("check_ins").insert(rows);
  if (error) throw error;
  return rows.length;
}

/** The linked habit starts no later than the challenge, so earlier days can be ticked on Today too. */
export async function alignHabitStart(habitId: string, start: string) {
  const { data } = await sb().from("habits").select("starts_on, created_at, from_challenge").eq("id", habitId).maybeSingle();
  const h = data as Pick<Habit, "starts_on" | "created_at" | "from_challenge"> | null;
  if (!h) return;
  const cur = h.starts_on ?? iso(new Date(h.created_at));
  if (start < cur) await sb().from("habits").update({ starts_on: start }).eq("id", habitId);
}

export async function loadFeed(limit = 60): Promise<CheckIn[]> {
  const { data, error } = await selectCheckIns((sel) => sb().from("check_ins").select(sel).order("created_at", { ascending: false }).limit(limit));
  if (error) throw error;
  return (data ?? []) as CheckIn[];
}

export async function toggleLike(checkInId: string, uid: string, liked: boolean) {
  if (liked) await sb().from("reactions").delete().eq("check_in_id", checkInId).eq("user_id", uid);
  else await sb().from("reactions").insert({ check_in_id: checkInId, user_id: uid });
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

export async function shareLink(url: string, title: string, text = `Join my challenge "${title}"`): Promise<"shared" | "copied"> {
  if (await nativeShare({ title, text, url })) return "shared";
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return "shared"; }
    catch (e) { if ((e as Error).name === "AbortError") return "shared"; }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
