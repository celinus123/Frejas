"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { isAppLike } from "@/lib/native";

/** The right side of the website's top bar. Someone who is signed in, or reading inside the app, gets the way back instead of the menu. */
export function SiteNav() {
  const { session } = useApp();
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(!!session || isAppLike()), [session]);
  return (
    <nav className="s-nav" aria-label="Main">
      {inApp ? <Link href="/" className="s-btn sm line">Back to the app</Link> : (
        <>
          <Link href="/#features">What it does</Link>
          <Link href="/support">Support</Link>
        </>
      )}
    </nav>
  );
}
