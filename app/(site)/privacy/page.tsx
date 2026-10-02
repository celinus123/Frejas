import { SiteDoc } from "@/components/site/SiteChrome";
import { LEGAL_UPDATED, PrivacyBody } from "@/components/legal";

export const metadata = { title: "Privacy policy · Frejas", description: "What Frejas stores about you, why, who can see it, and how to delete it.", alternates: { canonical: "https://frejas.app/privacy" } };

export default function Privacy() {
  return <SiteDoc title="Privacy policy" sub={`Last updated ${LEGAL_UPDATED}`}><PrivacyBody /></SiteDoc>;
}
