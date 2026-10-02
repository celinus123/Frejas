"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { Shell } from "./Shell";
import { Today } from "./Today";
import { isAppLike } from "@/lib/native";

/**
 * frejas.app itself. A visitor gets the website; someone who is signed in gets the app (Today);
 * inside the iPhone app, or the app saved to a home screen, someone signed out goes to the sign-in page.
 * The website is what the server sends, so search engines and link previews read it. A small script in
 * the page head (see app/layout.tsx) hides it before the first paint for people who are on their way into the app.
 */
export function HomeGate({ landing }: { landing: ReactNode }) {
  const { session, ready } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (!ready || session) return;
    if (isAppLike()) router.replace("/welcome");
    else document.documentElement.classList.remove("has-app");   // a visitor, or a sign-in that has run out
  }, [ready, session, router]);

  if (session) return <Shell><Today /></Shell>;
  return (
    <>
      <div className="home-wait page" aria-hidden="true"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 300 }} /></div>
      <div className="home-landing">{landing}</div>
    </>
  );
}
