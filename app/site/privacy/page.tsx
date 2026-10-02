import { SiteDoc } from "@/components/site/SiteChrome";
import { LEGAL_UPDATED, PrivacyBody } from "@/components/legal";

export const metadata = { title: "Privacy policy · Frejas" };

export default function SitePrivacy() {
  return <SiteDoc title="Privacy policy" sub={`Last updated ${LEGAL_UPDATED}`}><PrivacyBody /></SiteDoc>;
}
