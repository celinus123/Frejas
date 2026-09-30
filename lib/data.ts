"use client";
import { supabase } from "./supabase";
import type { Challenge, CheckIn, Habit, HabitLog, Member } from "./types";
import { today } from "./dates";

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

export const isActive = (c: Challenge) => c.starts_on <= today() && c.ends_on >= today();

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

export async function shareLink(url: string, title: string): Promise<"shared" | "copied"> {
  if (navigator.share) {
    try { await navigator.share({ title, text: `Join my challenge "${title}"`, url }); return "shared"; }
    catch (e) { if ((e as Error).name === "AbortError") return "shared"; }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
