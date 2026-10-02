import { LegalPage } from "@/components/LegalPage";
import { LEGAL_UPDATED, PrivacyBody } from "@/components/legal";

export default function Privacy() {
  return <LegalPage title="Privacy policy" updated={LEGAL_UPDATED}><PrivacyBody /></LegalPage>;
}
