"use client";
import type { PostHog } from "posthog-js";

// How the app is used, for people who have said yes to sharing it (Settings → Privacy). Sent to PostHog in the EU.
//
// What is sent: which screen is opened and which named action was done ("habit_ticked", "challenge_created"…),
// with a random id for the account, its level, and where Frejas runs (iPhone app, browser…).
// What is never sent: the names of habits or challenges, photos, comments, messages, or anything else someone writes.
// To keep it that way nothing is picked up automatically from the page: every event below is named by hand, and
// every address has its ids and tokens taken out before it leaves the phone.
//
// Nothing here runs until NEXT_PUBLIC_POSTHOG_KEY is set, and for one person not until they have said yes.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const LOCAL = HOST.startsWith("http://localhost");

let ph: PostHog | null = null;
let on = false;
let starting: Promise<void> | null = null;

export const analyticsConfigured = () => !!KEY;

/** /challenges/3f2a…/x?checkin=1 → /challenges/:id/x. Ids, invite tokens and friend codes never leave the phone. */
export function cleanPath(path: string): string {
  const p = path.split(/[?#]/)[0] || "/";
  return p.split("/").map((seg) => (/^[0-9a-f-]{10,}$/i.test(seg) || seg.length > 24 ? ":id" : seg)).join("/");
}
function cleanUrl(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    if (/^https?:\/\//i.test(v)) { const u = new URL(v); return `${u.origin}${cleanPath(u.pathname)}`; }
    if (v.startsWith("/")) return cleanPath(v);
  } catch { /* leave it out rather than send it as it is */ return null; }
  return v;
}
const ADDRESS = /url|pathname|referrer|href|host$/i;
function scrub(o: Record<string, unknown> | undefined) {
  if (!o) return;
  for (const k of Object.keys(o)) if (ADDRESS.test(k)) o[k] = cleanUrl(o[k]);
}

export interface Who { level?: string; platform?: string; guest?: boolean }

/** Starts sending for this person (they have said yes). Safe to call again. */
export function startAnalytics(userId: string, who: Who): Promise<void> {
  if (!KEY || typeof window === "undefined") return Promise.resolve();
  if (ph) { ph.opt_in_capturing({ captureEventName: false }); ph.identify(userId, who as Record<string, unknown>); on = true; return Promise.resolve(); }
  if (!starting) starting = (async () => {
    const { default: posthog } = await import("posthog-js");
    posthog.init(KEY, {
      api_host: HOST,
      ui_host: "https://eu.posthog.com",
      autocapture: false,                 // nothing is read off the page: button texts can be habit names
      capture_pageview: false,            // screens are sent by hand, with ids taken out
      capture_pageleave: true,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_performance: false,
      capture_exceptions: false,
      disable_session_recording: true,    // no recordings of the screen, ever
      disable_surveys: true,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      disable_compression: LOCAL,         // the two "local" settings only matter when testing against a stand-in on this machine
      opt_out_useragent_filter: LOCAL,    // (the library otherwise ignores the automated browser the tests run in)
      person_profiles: "identified_only",
      persistence: "localStorage",
      before_send: (ev) => {
        if (!ev) return ev;
        scrub(ev.properties as Record<string, unknown>);
        scrub(ev.$set as Record<string, unknown> | undefined);
        scrub(ev.$set_once as Record<string, unknown> | undefined);
        return ev;
      },
    });
    posthog.opt_in_capturing({ captureEventName: false });   // a "no" from earlier is remembered on the device: this is the yes
    posthog.identify(userId, who as Record<string, unknown>);
    ph = posthog; on = true;
  })().catch(() => { starting = null; });
  return starting;
}

/** Stops sending (they said no, or signed out) and forgets who this was on this device. */
export function stopAnalytics() {
  on = false;
  if (!ph) return;
  // forget first, then say no: the other way round the "no" is forgotten too, and leaving the page would still be sent
  try { ph.reset(); ph.opt_out_capturing(); } catch { /* nothing to stop */ }
}

/** One named thing that happened. Only plain facts in `props` (a count, yes/no, a kind): never text someone wrote. */
export function track(name: string, props?: Record<string, string | number | boolean | null>) {
  if (!on || !ph) return;
  try { ph.capture(name, props); } catch { /* never in the way of the app */ }
}

/** A screen was opened. */
export function trackScreen(path: string) {
  if (!on || !ph) return;
  const screen = cleanPath(path);
  try { ph.capture("$pageview", { $current_url: `${window.location.origin}${screen}`, $pathname: screen, screen }); } catch { /* ignore */ }
}
