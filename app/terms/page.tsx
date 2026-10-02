import { LegalPage } from "@/components/LegalPage";
import { LEGAL_UPDATED, TermsBody } from "@/components/legal";

export default function Terms() {
  return <LegalPage title="Terms" updated={LEGAL_UPDATED}><TermsBody /></LegalPage>;
}
