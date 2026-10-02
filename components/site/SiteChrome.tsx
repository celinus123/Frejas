import Link from "next/link";
import type { ReactNode } from "react";
import { FrejasMark } from "@/components/Logo";
import { SiteNav } from "./SiteNav";

/** The app's page in the App Store. Set it when the app is approved (https://apps.apple.com/app/id6818469944): the "coming soon" notes turn into buttons. */
export const APP_STORE_URL: string | null = null;

export function SiteHead({ on = "paper" }: { on?: "paper" | "raspberry" }) {
  return (
    <header className="s-wrap s-head">
      <Link href="/" aria-label="Frejas, to the start page" style={{ display: "block" }}><FrejasMark size={46} onRaspberry={on === "raspberry"} /></Link>
      <SiteNav />
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
        <Link href="/support">Support</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <a href="mailto:hello@frejas.app">hello@frejas.app</a>
        <Link href="/welcome" className="quiet">Log in</Link>
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
