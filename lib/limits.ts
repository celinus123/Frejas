"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// What your level has room for (supabase/019_levels.sql). The database holds the rules and refuses anything over
// them; the app asks first, so that nobody fills in a form only to be told no.
export interface Room { used: number; max: number | null }   // max null = no limit
export interface Limits { level: "guest" | "free" | "plus"; habits: Room; own: Room; joined: Room }
export type LimitKind = "habits" | "own" | "joined";

export const full = (r: Room) => r.max !== null && r.used >= r.max;

export async function myLimits(): Promise<Limits | null> {
  const { data, error } = await supabase().rpc("my_limits");
  return error ? null : ((data as Limits | null) ?? null);
}

/** limits: null while loading, and also if they can't be read (then nothing is held back here; the database still decides) */
export function useLimits(userId: string | null) {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(() => {
    if (!userId) return;
    myLimits().then((l) => { setLimits(l); setLoaded(true); }, () => setLoaded(true));
  }, [userId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { limits, loaded, refresh };
}
