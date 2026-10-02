import { SiteDoc } from "@/components/site/SiteChrome";
import { LEGAL_UPDATED, TermsBody } from "@/components/legal";

export const metadata = { title: "Terms · Frejas" };

export default function SiteTerms() {
  return <SiteDoc title="Terms" sub={`Last updated ${LEGAL_UPDATED}`}><TermsBody /></SiteDoc>;
}
