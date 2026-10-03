"use client";
import { supabase } from "./supabase";
import { platformName } from "./native";

// What Frejas keeps for its own numbers (supabase/020_insights.sql): which days the app was opened, how someone
// arrived, what people write as feedback, and their answers to a question. Nothing here leaves Frejas.

const SEEN = "frejas-seen";

/** Notes that the app was opened today. At most once every half hour per device. */
export function markSeen() {
  try {
    const last = Number(localStorage.getItem(SEEN) ?? 0);
    if (Date.now() - last < 30 * 60 * 1000) return;
    localStorage.setItem(SEEN, String(Date.now()));
  } catch { /* no storage: say it anyway */ }
  Promise.resolve(supabase().rpc("seen", { p_platform: platformName() })).then(() => {}, () => {});
}

/** Said once, when a new person has picked their name: did they come on their own, through a challenge link or a friend link? */
export function noteOrigin(invite: string | null, friend: string | null) {
  Promise.resolve(supabase().rpc("note_origin", {
    p_source: invite ? "challenge" : friend ? "friend" : "direct", p_ref: invite ?? friend ?? null, p_platform: platformName(),
  })).then(() => {}, () => {});
}

export async function sendFeedback(userId: string, body: string, page: string) {
  const { error } = await supabase().from("feedback").insert({
    user_id: userId, body: body.trim().slice(0, 1000), page: page.slice(0, 120),
    build: (process.env.NEXT_PUBLIC_BUILD_ID ?? "dev").slice(0, 7), platform: platformName(),
  });
  if (error) throw error;
}

export interface Question { id: string; body: string; kind: "choice" | "scale" | "text"; options: string[] | null }

export async function nextQuestion(): Promise<Question | null> {
  const { data, error } = await supabase().rpc("next_question");
  return error ? null : ((data as Question | null) ?? null);
}

export async function answerQuestion(userId: string, q: Question, a: { choice?: string; body?: string; skipped?: boolean }) {
  const { error } = await supabase().from("question_answers").insert({
    question_id: q.id, user_id: userId, choice: a.choice ?? null, body: a.body?.trim().slice(0, 500) || null, skipped: !!a.skipped,
  });
  if (error && error.code !== "23505") throw error;   // answered already (on another device): fine
}
