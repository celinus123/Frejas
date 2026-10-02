import type { Metadata } from "next";
import "@fontsource-variable/fraunces/wght-italic.css";   // the real italic, for one word in the headline
import "./site.css";

// A proposal for now: reachable only with the address, and search engines are asked to leave it alone.
export const metadata: Metadata = {
  title: "Frejas · habits with friends",
  description: "Track your habits, set challenges for yourself or with friends, and keep each other going.",
  robots: { index: false, follow: false },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site">{children}</div>;
}
