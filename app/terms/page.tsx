import { LegalPage } from "@/components/LegalPage";

// DRAFT — review before inviting people outside your circle.
export default function Terms() {
  return (
    <LegalPage title="Terms" updated="30 September 2026">
      <p>Frejas is a free app for tracking habits and running friendly challenges. By using it you agree to these terms.</p>
      <h2 className="h2">Be kind</h2>
      <p>Only post photos and comments you have the right to share, and nothing hateful, sexual, or that exposes someone else. We may remove content or accounts that break this.</p>
      <h2 className="h2">Stakes are between friends</h2>
      <p>"What's at stake" is a friendly promise between the people in a challenge. Frejas doesn't handle money and isn't responsible for whether stakes are paid.</p>
      <h2 className="h2">Your content</h2>
      <p>You own what you post. You let us store it and show it to the people you share it with, only to run the app.</p>
      <h2 className="h2">No guarantees</h2>
      <p>Frejas is a hobby project provided as it is. We do our best to keep it running and your data safe, but can't promise it will always be available. Frejas gives no health advice.</p>
      <h2 className="h2">Changes and ending</h2>
      <p>We may update these terms and will tell you in the app if something important changes. You can stop using Frejas and delete your account at any time.</p>
    </LegalPage>
  );
}
