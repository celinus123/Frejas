import { LegalPage } from "@/components/LegalPage";

// DRAFT — review before inviting people outside your circle.
export default function Terms() {
  return (
    <LegalPage title="Terms" updated="2 October 2026">
      <p>Frejas is a free app for tracking habits and running friendly challenges. By using it you agree to these terms.</p>
      <h2 className="h2">Be kind</h2>
      <p>Only post photos and comments you have the right to share, and nothing hateful, sexual, threatening, or that exposes or bullies someone else. There is no tolerance for this kind of content or for abusive behaviour.</p>
      <p>You can report a post, a comment, a message or a person from the three dots on it, and block anyone from the same place. We look at every report within 24 hours, remove what breaks these rules, and close the accounts of people who break them.</p>
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
