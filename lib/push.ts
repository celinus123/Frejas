"use client";
import { hasPlugin, isIOSApp as isNative } from "./native";
import { supabase } from "./supabase";
import type { Habit } from "./types";
import { track } from "./analytics";

/**
 * Notifications. Two kinds:
 *  · from other people (an invitation, a request to join, a comment, a new friend): sent by the server to the phone
 *  · your own reminders for a habit: set on the phone itself, so they also arrive without a connection
 * Both only exist in the iPhone app. In a browser every function here does nothing.
 */
// unavailable = a browser · old-app = an installed app from before notifications were built in
export type PushState = "unavailable" | "old-app" | "prompt" | "granted" | "denied";
export const NOTE_KINDS = [
  ["invite", "Invitations to challenges"],
  ["request", "Requests to join your challenges"],
  ["comment", "Comments on what you post"],
  ["friend", "New friends"],
] as const;
export type NoteKind = (typeof NOTE_KINDS)[number][0];

const TOKEN_KEY = "frejas-push-token";
const PROBLEM_KEY = "frejas-push-problem";
// The plugins are always taken out of their module right where they are used, never handed back from an async
// function: a Capacitor plugin answers to every name, "then" included, so `await` on the plugin itself never finishes.
const pushMod = () => import("@capacitor/push-notifications");
const localMod = () => import("@capacitor/local-notifications");
const asState = (s: string): PushState => (s === "granted" ? "granted" : s === "denied" ? "denied" : "prompt");

export async function pushState(): Promise<PushState> {
  if (!isNative()) return "unavailable";
  if (!hasPlugin("PushNotifications")) return "old-app";
  try { const { PushNotifications: P } = await pushMod(); return asState((await P.checkPermissions()).receive); } catch { return "unavailable"; }
}

let listening = false;
/** Called when the app opens: if notifications are allowed, makes sure this phone is known, and opens the right page when one is tapped. */
export async function startPush(open: (url: string) => void) {
  if (!isNative() || listening) return;
  listening = true;
  try {
    const { PushNotifications: P } = await pushMod();
    await P.addListener("registration", (t) => {
      try { localStorage.setItem(TOKEN_KEY, t.value); localStorage.removeItem(PROBLEM_KEY); } catch {}
      supabase().rpc("save_push_token", { p_token: t.value, p_platform: "ios" }).then(({ error }) => { if (error) try { localStorage.setItem(PROBLEM_KEY, `Couldn't save this phone: ${error.message}`); } catch {} }, () => {});
    });
    // the phone could not get an address from Apple (for example when the app was built without the right to send notifications)
    await P.addListener("registrationError", (e) => { try { localStorage.setItem(PROBLEM_KEY, e.error || "The phone couldn't register with Apple."); } catch {} });
    await P.addListener("pushNotificationActionPerformed", (a) => { const url = (a.notification.data as { url?: string } | undefined)?.url; if (url && url.startsWith("/")) open(url); });
    const { LocalNotifications: L } = await localMod();
    await L.addListener("localNotificationActionPerformed", (a) => { const url = (a.notification.extra as { url?: string } | undefined)?.url; if (url && url.startsWith("/")) open(url); });
    if ((await P.checkPermissions()).receive === "granted") await P.register();
  } catch { listening = false; }
}

/** Asks the phone for permission (the system's own question, shown once) and registers this phone. */
export async function enablePush(): Promise<PushState> {
  if (!isNative()) return "unavailable";
  try {
    const { PushNotifications: P } = await pushMod();
    let s = (await P.checkPermissions()).receive;
    if (s === "prompt" || s === "prompt-with-rationale") s = (await P.requestPermissions()).receive;
    if (s === "granted") await P.register();
    track("notifications_asked", { granted: s === "granted" });
    return asState(s);
  } catch { return "unavailable"; }
}

/** Where this phone stands: is it registered, and if not, what the phone or Apple said. For the Settings page. */
export async function pushDetails(): Promise<{ registered: boolean; problem: string | null }> {
  let token: string | null = null, problem: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); problem = localStorage.getItem(PROBLEM_KEY); } catch {}
  if (!token) return { registered: false, problem };
  const { data } = await supabase().from("push_tokens").select("token").eq("token", token).maybeSingle();
  return { registered: !!data, problem };
}

/** Sends a notification to your own phone and says what happened. */
export async function testPush(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  if (!data.session) return "You're not signed in.";
  try {
    const res = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ type: "test" }) });
    const r = (await res.json()) as { sent?: number; why?: string };
    return r.sent ? "Sent. It should arrive within a few seconds." : r.why || "Nothing was sent.";
  } catch { return "Couldn't reach the server. Try again."; }
}

/** On signing out: this phone stops getting the account's notifications, and its reminders are cleared. */
export async function forgetPush() {
  if (!isNative()) return;
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) await supabase().from("push_tokens").delete().eq("token", t);
    localStorage.removeItem(TOKEN_KEY);
    const { LocalNotifications: L } = await localMod();
    const pending = await L.getPending();
    if (pending.notifications.length) await L.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  } catch { /* nothing to undo */ }
}

/** Lets the other person's phone know. Never waits and never fails loudly: the thing itself is already saved. */
export function notify(what: { type: "invite"; challenge_id: string; user_id: string } | { type: "request"; challenge_id: string } | { type: "comment"; on: "checkin" | "day"; id: string } | { type: "friend"; user_id: string }) {
  supabase().auth.getSession().then(({ data }) => {
    if (!data.session) return;
    fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(what), keepalive: true }).catch(() => {});
  }, () => {});
}

// ---------------------------------------------------------------- your own reminders
/** "07:30:00" → "07:30" */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
// a number the phone can keep for each reminder (habit + weekday)
function idOf(habitId: string, day: number) {
  let h = 0;
  for (const ch of `${habitId}:${day}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 2000000000;
}
/** What the phone should have: one reminder per habit and day it is planned for (every day for flexible habits). */
export function remindersFor(habits: Pick<Habit, "id" | "name" | "frequency" | "days" | "reminder_time" | "archived_at">[]) {
  const out: { id: number; title: string; body: string; hour: number; minute: number; weekday?: number; url: string }[] = [];
  for (const h of habits) {
    if (!h.reminder_time || h.archived_at) continue;
    const [hour, minute] = h.reminder_time.split(":").map(Number);
    const base = { title: h.name, body: "Time for this one. Tick it off when you're done.", hour, minute, url: "/" };
    if (h.frequency === "specific_days" && h.days?.length) for (const d of h.days) out.push({ ...base, id: idOf(h.id, d), weekday: (d % 7) + 1 });   // the phone counts Sunday as 1
    else out.push({ ...base, id: idOf(h.id, 0) });
  }
  return out;
}
/** Makes the phone's reminders match your habits. Called whenever the habits are loaded. */
export async function syncReminders(habits: Parameters<typeof remindersFor>[0]) {
  if (!isNative()) return;
  try {
    const { LocalNotifications: L } = await localMod();
    const want = remindersFor(habits);
    const pending = await L.getPending();
    if (pending.notifications.length) await L.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!want.length || (await L.checkPermissions()).display !== "granted") return;
    await L.schedule({ notifications: want.map((w) => ({
      id: w.id, title: w.title, body: w.body, extra: { url: w.url },
      schedule: { on: w.weekday ? { weekday: w.weekday, hour: w.hour, minute: w.minute } : { hour: w.hour, minute: w.minute }, allowWhileIdle: true },
    })) });
  } catch { /* reminders are a nicety: never in the way of the app */ }
}
