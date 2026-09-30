import { LegalPage } from "@/components/LegalPage";

// DRAFT — review before inviting people outside your circle. Replace the [bracketed] parts.
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="30 September 2026">
      <p>Orbit is run by [Your full name], [city], Sweden, who is responsible for your personal data. Contact: [your email].</p>
      <h2 className="h2">What we store</h2>
      <p>Your email address (to sign you in), the name and optional photo you choose, the habits you create and when you tick them off, and the challenges, check-ins, photos and likes you add.</p>
      <p>Photos are resized and stripped of hidden information such as GPS location before they are uploaded.</p>
      <h2 className="h2">Why</h2>
      <p>Only to run the app for you: to show your habits and statistics, and to share your challenge check-ins with the people in that challenge. The legal basis is the agreement to provide the service (GDPR art. 6.1 b).</p>
      <p>Habits can say something about your health. They are private unless you choose to show them to friends, and we never analyse, sell or share them.</p>
      <h2 className="h2">Who can see what</h2>
      <p>Private habits: only you. Challenges and their check-ins: only people who have joined that challenge. Nothing is public, and there are no ads or tracking cookies.</p>
      <h2 className="h2">Where the data is</h2>
      <p>In the EU, with Supabase (database, sign-in and photo storage) and Vercel (hosting), who process it on our behalf under data processing agreements. Sign-in emails are sent by our email provider.</p>
      <h2 className="h2">How long</h2>
      <p>As long as you have an account. When you delete your account in Settings, your data is deleted right away and disappears from backups within 30 days.</p>
      <h2 className="h2">Your rights</h2>
      <p>You can download your data and delete your account in Settings at any time. You can also ask us to correct or delete data, and complain to the Swedish Authority for Privacy Protection (IMY).</p>
      <p>Orbit is for people aged 13 and over.</p>
    </LegalPage>
  );
}
