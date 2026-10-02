import { SiteDoc } from "@/components/site/SiteChrome";

const FAQ: [string, React.ReactNode][] = [
  ["How do I add a friend?", <p key="a">Open <b>Feed</b>, tap <b>Add</b> and share your friend link. Whoever opens it becomes your friend. You can also start a challenge and share its invite link: everyone who joins sees each other in that challenge.</p>],
  ["Who can see my habits and check-ins?", <><p>A habit is private unless you choose otherwise. For each habit you pick <b>Only me</b>, <b>All friends</b> or <b>Chosen friends</b>.</p><p>Check-ins in a challenge, with their photos and comments, are only seen by the people in that challenge. Nothing in Frejas is public.</p></>],
  ["How do I report something, or block someone?", <><p>Open the post and tap the three dots, tap the flag next to a comment, or tap a chat message. Choose <b>Report</b> and tell us what is wrong. We look at every report within 24 hours.</p><p>To block a person, tap their picture in <b>Feed</b> and choose <b>Report or block</b>. You stop seeing each other&apos;s posts, comments and messages, and they are not told. You can undo it in <b>Settings</b> under <b>Blocked people</b>.</p></>],
  ["How do I delete my account?", <><p>Go to your profile, open <b>Settings</b> and choose <b>Delete account</b>. Your habits, history, check-ins, photos and profile are removed right away.</p><p>If you can&apos;t sign in, write to us from the email address of your account and we will delete it for you.</p></>],
  ["Can I get a copy of my data?", <p key="a">Yes. In <b>Settings</b>, choose <b>Download my data</b>.</p>],
  ["The sign-in code never arrived", <p key="a">The email with the code can land in spam, so look there first. You can ask for a new one after 45 seconds. If it still doesn&apos;t come, write to us and we will help.</p>],
  ["Is Frejas free?", <p key="a">Yes. Frejas is free and has no ads.</p>],
  ["Which phones does it work on?", <p key="a">The iPhone app is on its way to the App Store. Until then, and on any other phone or computer, Frejas works in the browser at frejas.app.</p>],
];

export const metadata = { title: "Support · Frejas" };

export default function Support() {
  return (
    <SiteDoc title="Support" sub="Answers to the most common questions. If yours isn't here, write to us.">
      <div className="s-contact">
        <div><b>hello@frejas.app</b><span>We read everything and answer within two working days.</span></div>
        <a className="s-btn wine" href="mailto:hello@frejas.app">Write to us</a>
      </div>
      <h2>Questions and answers</h2>
      <div className="s-faq">
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><div>{a}</div></details>)}
      </div>
      <h2>Who runs Frejas</h2>
      <p>Frejas is made and run by Gabriella Blanche in Nice, France. Contact: <a href="mailto:hello@frejas.app">hello@frejas.app</a>.</p>
    </SiteDoc>
  );
}
