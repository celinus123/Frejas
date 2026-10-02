import { Icon } from "@/components/Icon";
import { FrejasMark } from "@/components/Logo";
import { APP_STORE_URL, SiteFoot, SiteHead } from "@/components/site/SiteChrome";

function Phone({ src, alt }: { src: string; alt: string }) {
  // loaded only when shown: someone on their way into the app never sees this page, and then never downloads its pictures
  return <div className="s-phone"><img src={`/web/${src}.jpg`} alt={alt} width={390} height={844} loading="lazy" decoding="async" /></div>;
}

/** The way to the app: a button once it is in the App Store, a note until then. */
function GetApp({ tone }: { tone: "cream" | "cta" }) {
  return APP_STORE_URL
    ? <a href={APP_STORE_URL} className={`s-btn ${tone}`}>Get Frejas for iPhone</a>
    : <span className="s-soon"><Icon name="clock" size={18} />Coming soon to the App Store</span>;
}

function Feature({ flip, tile, shot, alt, eyebrow, title, text, ticks }: { flip?: boolean; tile: "pink" | "cream" | "rose"; shot: string; alt: string; eyebrow: string; title: string; text: string; ticks: string[] }) {
  return (
    <div className={flip ? "s-feature flip" : "s-feature"}>
      <div className={`s-tile ${tile}`}><Phone src={shot} alt={alt} /></div>
      <div>
        <div className="s-eyebrow">{eyebrow}</div>
        <h2 className="s-display s-h2">{title}</h2>
        <p>{text}</p>
        <ul className="s-ticks">{ticks.map((t) => <li key={t}><i><Icon name="check" size={14} stroke={2.8} /></i>{t}</li>)}</ul>
      </div>
    </div>
  );
}

/** frejas.app for a visitor: what Frejas is, what it does, and how to get it. */
export function Home() {
  return (
    <>
      <section className="s-hero a">
        <SiteHead on="raspberry" />
        <div className="s-wrap s-hero-grid">
          <div>
            <h1 className="s-display">Habits are easier with <em>friends.</em></h1>
            <p className="lead">Frejas keeps your habits in one calm place. Turn any of them into a challenge, on your own or with friends, and keep each other going.</p>
            <div className="s-actions"><GetApp tone="cream" /></div>
            <div className="s-facts">
              <span><Icon name="check" size={17} stroke={2.6} />Free</span>
              <span><Icon name="check" size={17} stroke={2.6} />No ads</span>
              <span><Icon name="check" size={17} stroke={2.6} />Private until you share</span>
            </div>
          </div>
          <div className="s-stage">
            <div className="s-phone back" aria-hidden="true"><img src="/web/challenge.jpg" alt="" width={390} height={844} loading="lazy" decoding="async" /></div>
            <Phone src="today" alt="The Today screen in Frejas: this week, today's progress and the habits to tick off" />
          </div>
        </div>
      </section>

      <section className="s-section" id="features">
        <div className="s-wrap">
          <Feature tile="pink" shot="habit" alt="One habit in Frejas, with its streak and its calendar" eyebrow="Your day" title="Tick it off. Watch the week fill up."
            text="Every day, a few times a week, or only on Mondays: set a habit up once and it shows up when it should."
            ticks={["One tap to tick a habit off", "Go back and fill in a day you forgot", "Sort habits into your own categories"]} />
          <Feature flip tile="rose" shot="leaderboard" alt="A challenge in Frejas with its leaderboard" eyebrow="Challenges" title="Make it a challenge. Loser cooks dinner."
            text="Pick the goal, the last day and what's at stake. Do it on your own, or send friends a link and see who keeps it up."
            ticks={["You choose how to win: most consistent, most sessions, or everyone who makes it", "You decide who can join", "A group chat for each challenge"]} />
          <Feature tile="pink" shot="feed" alt="The feed in Frejas with check-ins from friends" eyebrow="Friends" title="A little cheering goes a long way."
            text="Check in with a photo and a line about how it went. Friends answer with a heart, a clap or a comment."
            ticks={["Check-ins stay inside the challenge", "Choose which habits friends can see", "Report or block anyone, any time"]} />
          <Feature flip tile="cream" shot="stats2" alt="Statistics in Frejas: strongest habits and the ones that need a little love" eyebrow="Stats" title="See what's working."
            text="Your month at a glance, your strongest habits, and the ones that need a little love."
            ticks={["Week, month and year", "Patterns, like which days you tend to skip", "A weekly recap in your feed"]} />
        </div>
      </section>

      <section className="s-section s-band">
        <div className="s-wrap">
          <div className="s-eyebrow">Yours</div>
          <h2 className="s-display s-h2">Private until you say otherwise.</h2>
          <div className="s-three">
            <div className="s-card"><div className="s-ico"><Icon name="lock" size={24} /></div><h3>Only you, by default</h3><p>A new habit is private. You choose, habit by habit, whether all friends, a few, or nobody sees it.</p></div>
            <div className="s-card"><div className="s-ico"><Icon name="shield" size={24} /></div><h3>No ads, no tracking</h3><p>Frejas doesn&apos;t sell or analyse what you track. There is nothing public and no advertising.</p></div>
            <div className="s-card"><div className="s-ico"><Icon name="download" size={24} /></div><h3>Take it or delete it</h3><p>Download everything you have saved, or delete your account and all of it, straight from Settings.</p></div>
          </div>
        </div>
      </section>

      <section className="s-section">
        <div className="s-wrap">
          <div className="s-eyebrow">How it starts</div>
          <h2 className="s-display s-h2">Three minutes from now.</h2>
          <div className="s-three">
            <div className="s-card"><div className="s-num">1</div><h3>Add one habit</h3><p>Something small you want to do more often. Name it and say how often.</p></div>
            <div className="s-card"><div className="s-num">2</div><h3>Make it a challenge</h3><p>Give it an end date and something at stake. Thirty days is a good start.</p></div>
            <div className="s-card"><div className="s-num">3</div><h3>Send the link</h3><p>Friends join from the link. From there you keep each other honest.</p></div>
          </div>
          <div className="s-last" style={{ marginTop: 96 }}>
            <FrejasMark size={64} />
            <h2 className="s-display">Start with one habit.</h2>
            <p>Frejas is free. It takes a minute to set up, and you can bring your friends in later.</p>
            <GetApp tone="cta" />
          </div>
        </div>
      </section>

      <SiteFoot />
    </>
  );
}
