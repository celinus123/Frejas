/* The words of the privacy policy and the terms, in one place: shown inside the app and on the website. */
export const LEGAL_UPDATED = "2 October 2026";

export function PrivacyBody() {
  return (
    <>
      <p>Frejas is run by Gabriella Blanche, Nice, France, who is responsible for your personal data. Contact: <a href="mailto:gabriella@frejas.app">gabriella@frejas.app</a>.</p>
      <h2 className="h2">What we store</h2>
      <p>Your email address (to sign you in), the name and optional photo you choose, the habits you create (with their category) and when you tick them off, and the challenges, check-ins, photos, likes and chat messages you add.</p>
      <p>If you block someone, we store that so it keeps working. If you report something, we store the report, who sent it, and a copy of what was reported, so that we can act on it. The person who looks after Frejas reads what was reported, including a reported photo. The person you report or block is not told it was you.</p>
      <p>Photos are resized and stripped of hidden information such as GPS location before they are uploaded.</p>
      <h2 className="h2">Why</h2>
      <p>Only to run the app for you: to show your habits and statistics, and to share your challenge check-ins with the people in that challenge. The legal basis is the agreement to provide the service (GDPR art. 6.1 b).</p>
      <p>Habits can say something about your health. They are private unless you choose to show them to friends, and we never analyse, sell or share them.</p>
      <h2 className="h2">Who can see what</h2>
      <p>Private habits: only you. Challenges and their check-ins: only people who have joined that challenge. Nothing is public, and there are no ads or tracking cookies.</p>
      <h2 className="h2">Where the data is</h2>
      <p>Your data is stored in the EU (Ireland) with Supabase, which runs our database, sign-in and photo storage. Vercel hosts the app and Resend sends the sign-in emails. They are US companies and may process limited data, such as your email address and IP address, outside the EU. All three process data only on our behalf, under data processing agreements and the EU standard contractual clauses or the EU–US Data Privacy Framework.</p>
      <h2 className="h2">How long</h2>
      <p>As long as you have an account. When you delete your account in Settings, your data is deleted right away and disappears from backups within 30 days.</p>
      <h2 className="h2">Your rights</h2>
      <p>You can download your data and delete your account in Settings at any time. You can also ask us to correct or delete data, and complain to the French data protection authority, the CNIL (cnil.fr).</p>
      <p>Frejas is for people aged 13 and over.</p>
    </>
  );
}

// DRAFT — review before inviting people outside your circle.
export function TermsBody() {
  return (
    <>
      <p>Frejas is a free app for tracking habits and running friendly challenges. By using it you agree to these terms.</p>
      <h2 className="h2">Be kind</h2>
      <p>Only post photos and comments you have the right to share, and nothing hateful, sexual, threatening, or that exposes or bullies someone else. There is no tolerance for this kind of content or for abusive behaviour. Hate words and threats are stopped before they are posted.</p>
      <p>You can report a post, a comment, a message or a person from the three dots on it, and block anyone from the same place. We look at every report within 24 hours, remove what breaks these rules, and close the accounts of people who break them.</p>
      <h2 className="h2">Stakes are between friends</h2>
      <p>"What's at stake" is a friendly promise between the people in a challenge. Frejas doesn't handle money and isn't responsible for whether stakes are paid.</p>
      <h2 className="h2">Your content</h2>
      <p>You own what you post. You let us store it and show it to the people you share it with, only to run the app.</p>
      <h2 className="h2">No guarantees</h2>
      <p>Frejas is a hobby project provided as it is. We do our best to keep it running and your data safe, but can't promise it will always be available. Frejas gives no health advice.</p>
      <h2 className="h2">Changes and ending</h2>
      <p>We may update these terms and will tell you in the app if something important changes. You can stop using Frejas and delete your account at any time.</p>
    </>
  );
}
