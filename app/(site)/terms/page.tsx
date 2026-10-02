import { SiteDoc } from "@/components/site/SiteChrome";
import { LEGAL_UPDATED, TermsBody } from "@/components/legal";

export const metadata = { title: "Terms · Frejas", description: "The terms for using Frejas.", alternates: { canonical: "https://frejas.app/terms" } };

export default function Terms() {
  return <SiteDoc title="Terms" sub={`Last updated ${LEGAL_UPDATED}`}><TermsBody /></SiteDoc>;
}
