"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface Toast { text: ReactNode; action?: { label: string; onClick: () => void }; undo?: () => void }
interface Ctx {
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  setTheme: (t: Profile["theme"]) => void;
  toast: (t: Toast) => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

const PUBLIC = ["/welcome", "/join", "/privacy", "/terms"];

function applyTheme(t: Profile["theme"]) {
  const el = document.documentElement;
  if (t === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
  try { localStorage.setItem("orbit-theme", t); } catch {}
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toastState, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Route guard: signed-out users go to /welcome, new users pick a name first.
  useEffect(() => {
    if (!ready) return;
    const isPublic = PUBLIC.some((p) => path.startsWith(p));
    if (!session && !isPublic) router.replace("/welcome");
    else if (session && profile && !profile.display_name && !path.startsWith("/welcome")) {
      const invite = path.startsWith("/join/") ? `&invite=${path.split("/")[2]}` : "";
      router.replace(`/welcome?step=name${invite}`);
    }
  }, [ready, session, profile, path, router]);

  const toast = useCallback((t: Toast) => {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const value = useMemo<Ctx>(() => ({
    session,
    userId: session?.user.id ?? null,
    profile,
    refreshProfile: async () => { if (session) await loadProfile(session.user.id); },
    setTheme: (t) => { applyTheme(t); setProfile((p) => (p ? { ...p, theme: t } : p)); },
    toast,
  }), [session, profile, loadProfile, toast]);

  const isPublic = PUBLIC.some((p) => path.startsWith(p));
  const blocked = !ready || (!session && !isPublic);

  return (
    <AppCtx.Provider value={value}>
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
