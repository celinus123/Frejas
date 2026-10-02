import type { Metadata } from "next";
import "@fontsource-variable/fraunces/wght-italic.css";   // the real italic, for one word in the headline
import "./site.css";
import { HomeGate } from "@/components/HomeGate";
import { Home } from "@/components/site/Home";

export const metadata: Metadata = {
  title: "Frejas · habits with friends",
  description: "Track your habits, set challenges for yourself or with friends, and keep each other going. Free, no ads, private until you share.",
  alternates: { canonical: "https://frejas.app/" },
  openGraph: { title: "Frejas · habits with friends", description: "Track your habits, set challenges for yourself or with friends, and keep each other going.", url: "https://frejas.app/", siteName: "Frejas", type: "website" },
};

export default function Root() {
  return <HomeGate landing={<div className="site"><Home /></div>} />;
}
