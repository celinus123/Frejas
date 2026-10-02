import { LegalPage } from "@/components/LegalPage";

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="2 October 2026">
      <p>Frejas is run by Gabriella Blanche, Nice, France, who is responsible for your personal data. Contact: <a href="mailto:gabriella@frejas.app">gabriella@frejas.app</a>.</p>
      <h2 className="h2">What we store</h2>
      <p>Your email address (to sign you in), the name and optional photo you choose, the habits you create (with their category) and when you tick them off, and the challenges, check-ins, photos, likes and chat messages you add.</p>
      <p>If you block someone, we store that so it keeps working. If you report something, we store the report, who sent it, and a copy of what was reported, so that we can act on it. The person you report or block is not told it was you.</p>
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
    </LegalPage>
  );
}
