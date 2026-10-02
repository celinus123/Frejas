import Link from "next/link";
import type { ReactNode } from "react";
import { FrejasMark } from "@/components/Logo";

/** Where the website lives. It is "/site" while it is a proposal, and becomes "" when it takes over frejas.app. */
export const SITE = "/site";

export function SiteHead({ on = "paper" }: { on?: "paper" | "raspberry" }) {
  const dark = on === "raspberry";
  return (
    <header className="s-wrap s-head">
      <Link href={SITE || "/"} aria-label="Frejas, to the start page" style={{ display: "block" }}><FrejasMark size={46} onRaspberry={dark} /></Link>
      <nav className="s-nav" aria-label="Main">
        <Link className="wide" href={`${SITE}#features`}>What it does</Link>
        <Link className="wide" href={`${SITE}/support`}>Support</Link>
        <Link href="/welcome">Log in</Link>
        <Link href="/welcome" className={`s-btn sm ${dark ? "cream" : "cta"}`}>Get started</Link>
      </nav>
    </header>
  );
}

export function SiteFoot() {
  return (
    <footer className="s-wrap s-foot">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <FrejasMark size={38} />
        <span>Frejas · habits with friends<br />© 2026 Gabriella Blanche, Nice, France</span>
      </div>
      <nav aria-label="More">
        <Link href={`${SITE}/support`}>Support</Link>
        <Link href={`${SITE}/privacy`}>Privacy</Link>
        <Link href={`${SITE}/terms`}>Terms</Link>
        <a href="mailto:hello@frejas.app">hello@frejas.app</a>
      </nav>
    </footer>
  );
}

/** A text page: support, privacy policy, terms. */
export function SiteDoc({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <>
      <SiteHead />
      <main className="s-doc">
        <h1 className="s-display">{title}</h1>
        {sub && <p className="s-sub">{sub}</p>}
        {children}
      </main>
      <SiteFoot />
    </>
  );
}
