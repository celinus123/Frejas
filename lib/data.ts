"use client";
import { supabase } from "./supabase";
import type { Challenge, CheckIn, Habit, HabitLog, Member } from "./types";
import { today } from "./dates";
import { nativeShare } from "./native";

const sb = () => supabase();

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
    times_per_week: c.frequency === "times_per_week" ? times : null, starts_on: c.starts_on, from_challenge: c.id,
  }).select("id").single();
  if (error || !data) return null;
  await sb().from("challenge_members").update({ habit_id: data.id }).eq("challenge_id", c.id).eq("user_id", uid);
  return data.id as string;
}

export async function loadChallenge(id: string) {
  const [c, m, ci] = await Promise.all([
    sb().from("challenges").select("*").eq("id", id).maybeSingle(),
    sb().from("challenge_members").select("*, profiles(display_name, avatar_path)").eq("challenge_id", id).order("joined_at"),
    sb().from("check_ins").select("*, profiles(display_name, avatar_path), reactions(user_id)").eq("challenge_id", id).order("created_at", { ascending: false }),
  ]);
  if (c.error) throw c.error;
  return { challenge: c.data as Challenge | null, members: (m.data ?? []) as Member[], checkins: (ci.data ?? []) as CheckIn[] };
}

export async function loadFeed(limit = 60): Promise<CheckIn[]> {
  const { data, error } = await sb().from("check_ins").select("*, profiles(display_name, avatar_path), reactions(user_id)")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as CheckIn[];
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
