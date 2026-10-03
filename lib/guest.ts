"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Starting without an account. A guest is a real user on the server with no email: everything works the same,
// but the only key to it is this phone or browser. Adding an email later turns the same user into an account.

let asked: Promise<boolean> | null = null;

/** Is starting without an account switched on? Asked from the sign-in service itself (Supabase → Authentication →
 *  "Allow anonymous sign-ins"), so the button shows up as soon as the switch is flipped, and never before. */
export function guestAllowed(): Promise<boolean> {
  if (!asked) asked = (async () => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return false;
      const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      if (!r.ok) return false;
      const s = (await r.json()) as { external?: { anonymous_users?: boolean } };
      return s.external?.anonymous_users === true;
    } catch { return false; }
  })();
  return asked;
}

/** For the pages a visitor lands on (a first screen, an invitation, a friend link): whether they can start without
 *  an account, and the tap that does it. Once started, the app asks for a name and carries on where they were. */
export function useGuestStart() {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { guestAllowed().then(setOk); }, []);
  async function start() {
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.signInAnonymously();
    if (!error) return;   // stays busy: the app is on its way to the name step
    setBusy(false);
    setErr(error.status === 429 || /rate limit/i.test(error.message)
      ? "Too many people started from this network just now. Try again in a while, or continue with email."
      : "Couldn't start right now. Try again, or continue with email.");
  }
  return { ok, busy, err, start, clear: () => setErr(null) };
}
