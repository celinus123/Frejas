/* The words of the privacy policy and the terms, in one place: shown inside the app and on the website. */
export const LEGAL_UPDATED = "3 October 2026";
// Two parts of the policy are only true once the tool they describe is switched on, so they only show then.
const USAGE = !!process.env.NEXT_PUBLIC_POSTHOG_KEY;       // sharing how the app is used (PostHog)
const ROBOTS = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; // the robot check at sign-in (Cloudflare Turnstile)

export function PrivacyBody() {
  return (
    <>
      <p>Frejas is run by Gabriella Blanche, Nice, France, who is responsible for your personal data. Contact: <a href="mailto:gabriella@frejas.app">gabriella@frejas.app</a>.</p>
      <h2 className="h2">What we store</h2>
      <p>Your email address if you have added one (to sign you in), the name and optional photo you choose, the habits you create (with their category) and when you tick them off, and the challenges, check-ins, photos, likes and chat messages you add.</p>
      <p>You can use Frejas without an account. We then store the same things, but no email address, and what you make can only be opened from the device you started on until you add your email in Settings.</p>
      <p>If you block someone, we store that so it keeps working. If you report something, we store the report, who sent it, and a copy of what was reported, so that we can act on it. The person who looks after Frejas reads what was reported, including a reported photo. The person you report or block is not told it was you.</p>
      <p>If you turn on notifications in the iPhone app, we store the address Apple gives your phone for Frejas, so that we can send them. Apple delivers the notification. The address is removed when you sign out. Reminders you set for a habit are kept on your phone.</p>
      <p>Photos are resized and stripped of hidden information such as GPS location before they are uploaded.</p>
      <p>To see how Frejas is doing we also keep: which days you opened the app (the day, not the time), whether you found Frejas on your own or through a friend&apos;s link, the feedback you send us, and your answers when we ask everyone a question. Feedback and answers are kept with your account, so that we can ask you more if we need to.</p>
      {USAGE && (<>
        <h2 className="h2">How you use the app, only if you say yes</h2>
        <p>The app asks whether you want to share how you use it. If you say yes, we record which screens you open and which buttons you tap, together with a random number for your account, whether you are on the free or paid level, and basic facts about your device: the kind of phone and browser, screen size, language and time zone. As with any website, the server that receives it also sees your IP address. We use all this to find what is confusing and fix it.</p>
        <p>We never record the names of your habits or challenges, your photos, comments or messages, or anything else you write, and we make no recordings of your screen. If you say no, nothing of this is recorded. You can change your answer at any time in Settings, under Privacy. The legal basis is your consent (GDPR art. 6.1 a).</p>
      </>)}
      <h2 className="h2">Why</h2>
      <p>To run the app for you: to show your habits and statistics, and to share your challenge check-ins with the people in that challenge. The legal basis is the agreement to provide the service (GDPR art. 6.1 b). We also count totals, such as how many people come back after a week or how many habits people have on average, to make Frejas better. The legal basis is our legitimate interest in improving the service (GDPR art. 6.1 f).</p>
      <p>Habits can say something about your health. They are private unless you choose to show them to friends, and we never sell or share them. When we count totals, the names of your habits are never part of it.</p>
      <h2 className="h2">Who can see what</h2>
      <p>Private habits: only you. Challenges and their check-ins: only people who have joined that challenge. Nothing is public, and there are no ads.{USAGE ? " Nothing is stored on your device to follow how you use the app unless you have said yes to sharing that." : " There are no tracking cookies."}</p>
      <h2 className="h2">Where the data is</h2>
      <p>Your data is stored in the EU (Ireland) with Supabase, which runs our database, sign-in and photo storage. Vercel hosts the app and Resend sends the sign-in emails. They are US companies and may process limited data, such as your email address and IP address, outside the EU.{USAGE ? " If you have said yes to sharing how you use the app, that is stored with PostHog on servers in the EU (Germany)." : ""}{ROBOTS ? " To keep robots out, Cloudflare checks that a sign-in comes from a person; for that it sees your IP address and basic facts about your browser." : ""} All of them process data only on our behalf, under data processing agreements and the EU standard contractual clauses or the EU–US Data Privacy Framework.</p>
      <h2 className="h2">How long</h2>
      <p>As long as you use Frejas, with or without an account. When you delete your account (or, without an account, everything) in Settings, your data is deleted right away and disappears from backups within 30 days.{USAGE ? " What was recorded about how you use the app is kept for at most a year, and you can ask us to delete it sooner." : ""}</p>
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
