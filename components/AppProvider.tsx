"use client";
import { syncStatusBar } from "@/lib/native";
import { markSeen } from "@/lib/usage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { startPush } from "@/lib/push";

interface Toast { text: ReactNode; action?: { label: string; onClick: () => void }; undo?: () => void }
interface Ctx {
  session: Session | null;
  ready: boolean;                    // false until we know whether someone is signed in
  userId: string | null;
  guest: boolean;                    // using Frejas without an account (no email yet)
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  setTheme: (t: Profile["theme"]) => void;
  toast: (t: Toast) => void;
  unread: number;                    // notifications in the list that haven't been read
  refreshUnread: () => void;
  reportsOpen: number | null;        // reports waiting; null for everyone who doesn't look after reports
  refreshReports: () => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

const PUBLIC = ["/welcome", "/join", "/add", "/privacy", "/terms", "/support"];
// the website: shown straight away, without waiting to find out whether someone is signed in
const SITE = ["/privacy", "/terms", "/support"];
// "/" is the website for a visitor and the app for someone signed in; components/HomeGate decides
const open = (path: string) => path === "/" || PUBLIC.some((p) => path.startsWith(p));

function applyTheme(t: Profile["theme"]) {
  const el = document.documentElement;
  if (t === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
  try { localStorage.setItem("orbit-theme", t); } catch {}
  syncStatusBar();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toastState, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reportsOpen, setReportsOpen] = useState<number | null>(null);
  const uidNow = session?.user.id ?? null;
  const refreshReports = useCallback(() => {
    if (!uidNow) { setReportsOpen(null); return; }
    Promise.resolve(supabase().rpc("open_reports")).then(({ data, error }) => setReportsOpen(error || typeof data !== "number" ? null : data), () => {});
  }, [uidNow]);
  const looksAfter = useRef(false);
  looksAfter.current = reportsOpen !== null;
  const [unread, setUnread] = useState(0);
  const refreshUnread = useCallback(() => {
    if (!uidNow) { setUnread(0); return; }
    Promise.resolve(supabase().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).then(({ count, error }) => setUnread(error ? 0 : count ?? 0), () => {});
  }, [uidNow]);
  useEffect(() => {
    refreshUnread();
    const onVis = () => { if (document.visibilityState === "visible") refreshUnread(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshUnread]);
  // for Frejas's own numbers: note the days the app is opened (the day only), once someone has a name
  const named = !!profile?.display_name;
  useEffect(() => {
    if (!uidNow || !named) return;
    markSeen();
    const onVis = () => { if (document.visibilityState === "visible") markSeen(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [uidNow, named]);
  // in the iPhone app: keep this phone known for notifications, and open the right page when one is tapped
  useEffect(() => { if (uidNow) startPush((url) => router.push(url)); }, [uidNow, router]);
  // asked when the app opens; whoever looks after reports is also asked each time the app comes back to the front
  useEffect(() => {
    refreshReports();
    const onVis = () => { if (document.visibilityState === "visible" && looksAfter.current) refreshReports(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshReports]);

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase().from("profiles").select("*").eq("id", uid).maybeSingle();
    setProfile(data as Profile | null);
    if (data) applyTheme((data as Profile).theme);
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    syncStatusBar();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", syncStatusBar);
    return () => mq.removeEventListener("change", syncStatusBar);
  }, []);

  // When a new version is published, reload the next time the app comes back to the foreground
  // (a phone keeps a home-screen app open for days, so it would otherwise keep running old code).
  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!mine || mine === "dev") return;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { build } = await r.json();
        const typing = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
        if (build && build !== "dev" && build !== mine && !typing && !document.querySelector(".sheet")) window.location.reload();
      } catch { /* offline: try again later */ }
      checking = false;
    };
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(check, 5 * 60 * 1000);
    check();
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, []);

  // Route guard: signed-out users go to /welcome, new users pick a name first.
  useEffect(() => {
    if (!ready) return;
    const isPublic = open(path);
    if (!session && !isPublic) router.replace(`/welcome${window.location.hash.includes("error") ? window.location.hash : ""}`);
    else if (session && profile && !profile.display_name && !path.startsWith("/welcome")) {
      const invite = path.startsWith("/join/") ? `&invite=${path.split("/")[2]}` : path.startsWith("/add/") ? `&friend=${path.split("/")[2]}` : "";
      router.replace(`/welcome?step=name${invite}`);
    }
  }, [ready, session, profile, path, router]);

  const toast = useCallback((t: Toast) => {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const value = useMemo<Ctx>(() => ({
    session, ready,
    userId: session?.user.id ?? null,
    guest: !!session?.user.is_anonymous,
    profile,
    refreshProfile: async () => { if (session) await loadProfile(session.user.id); },
    setTheme: (t) => { applyTheme(t); setProfile((p) => (p ? { ...p, theme: t } : p)); },
    toast,
    unread, refreshUnread,
    reportsOpen, refreshReports,
  }), [session, ready, profile, loadProfile, toast, unread, refreshUnread, reportsOpen, refreshReports]);

  const blocked = path !== "/" && !SITE.some((p) => path.startsWith(p)) && (!ready || (!session && !open(path)));

  // has the page scrolled? (only flips when crossing the top, so it costs nothing while scrolling)
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 6);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [path]);

  return (
    <AppCtx.Provider value={value}>
      <div className={scrolled ? "statusbar-cover on" : "statusbar-cover"} aria-hidden="true" />
      {blocked ? <div className="page"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 300 }} /></div> : children}
      {toastState && (
        <div role="status" style={{ position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom) + 100px)", zIndex: 50, display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 448, width: "100%", padding: "12px 12px 12px 16px", borderRadius: 18, background: "var(--ink)", color: "var(--bg)", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 10px 30px rgba(0,0,0,.2)" }}>
            <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.35 }}>{toastState.text}</span>
            {toastState.action && (
              <button onClick={() => { toastState.action!.onClick(); setToast(null); }} style={{ height: 36, padding: "0 12px", borderRadius: 18, border: 0, background: "rgba(127,127,127,.25)", color: "inherit", fontSize: 13, fontWeight: 800 }}>{toastState.action.label}</button>
            )}
            {toastState.undo && (
              <button onClick={() => { toastState.undo!(); setToast(null); }} style={{ height: 36, padding: "0 6px", border: 0, background: "none", color: "inherit", fontSize: 13, fontWeight: 800, opacity: .8 }}>Undo</button>
            )}
          </div>
        </div>
      )}
    </AppCtx.Provider>
  );
}
