"use client";

// A check that a sign-in comes from a person and not a robot (Cloudflare Turnstile). Supabase asks for it once
// "CAPTCHA protection" is switched on there; until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, nothing here does anything.
//
// The check is invisible unless Cloudflare wants the person to tap a box, which then shows at the bottom of the screen.
// Each proof works once, so a new one is fetched for every sign-in request.

const SITE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: Turnstile } }

export const captchaOn = () => !!SITE;

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true;
    s.onload = () => (window.turnstile ? resolve() : reject(new Error("not ready")));
    s.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(s);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

/** A fresh proof for one sign-in request. Empty when the check isn't set up, can't be reached, or took too long;
 *  the request is then sent without it, and Supabase says no if it insists on one. */
export async function captchaToken(): Promise<string | undefined> {
  if (!SITE || typeof window === "undefined") return undefined;
  try { await load(); } catch { return undefined; }
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 16px);transform:translateX(-50%);z-index:60";
    document.body.appendChild(box);
    let done = false, id = "";
    const finish = (token?: string) => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { if (id) window.turnstile?.remove(id); } catch { /* already gone */ }
      box.remove();
      resolve(token);
    };
    const timer = setTimeout(() => finish(), 45000);
    try {
      id = window.turnstile!.render(box, {
        sitekey: SITE, appearance: "interaction-only", theme: "auto",
        callback: (token: string) => finish(token),
        "error-callback": () => { finish(); return true; },
        "timeout-callback": () => finish(),
        "unsupported-callback": () => finish(),
      });
    } catch { finish(); }
  });
}

/** Did Supabase turn a request down because the robot check was missing or failed? */
export const isCaptchaError = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (/captcha/i.test(e.message ?? "") || /captcha/i.test(e.code ?? ""));

export const CAPTCHA_FAILED = "Couldn't check that you're a person and not a robot. Check your connection and try again.";
