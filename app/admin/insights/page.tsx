"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { BackBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";

interface Dist { n: number; people: number }
interface Cohort { week: string; size: number; w1: number; w2: number; w3: number; w4: number; n1: number; n2: number; n3: number; n4: number }
interface Stats {
  as_of: string;
  people: { total: number; guests: number; accounts: number; plus: number; unnamed: number; new_7d: number; new_prev_7d: number };
  active: { today: number; d7: number; prev_d7: number; d30: number };
  daily: { day: string; active: number; new: number }[];
  came_back: { of: number; n: number };
  cohorts: Cohort[];
  habits: { dist: Dist[]; avg: number | null; median: number | null; ticks_7d: number; tickers_7d: number };
  challenges: { own_dist: Dist[]; joined_dist: Dist[]; in_any: number; ongoing_solo: number; ongoing_friends: number; checkins_7d: number; checkers_7d: number };
  friends: { with_any: number; friendships: number; invites_sent: number; challenges_inviting: number; comments_7d: number };
  origin: { direct: number; challenge: number; friend: number; unknown: number; recruiters: number };
  guests: { started: number; saved: number };
  notifications: { phones: number };
  usage: { yes: number; no: number };
  inbox: { feedback_open: number; questions_open: number; left_out?: number };
}

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");
const day = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", opts);
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** One number with its name, and what it is compared to. */
function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <div className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: "var(--t-sub)", lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}
const versus = (now: number, before: number) => (now === before ? "same as the week before" : `${now > before ? "+" : "−"}${Math.abs(now - before)} vs the week before`);

/** How many people have 0, 1, 2 … of something: one bar per number, the count written beside it. */
function Bars({ rows, total, label }: { rows: { name: string; n: number }[]; total: number; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div role="table" aria-label={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div role="row" key={r.name} style={{ display: "grid", gridTemplateColumns: "92px 1fr 74px", alignItems: "center", gap: 10, minHeight: 22 }}>
          <span role="cell" className="muted" style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
          <span aria-hidden="true" style={{ height: 12, borderRadius: 6, background: "var(--soft-l)" }}>
            <span style={{ display: "block", height: "100%", width: `${(r.n / max) * 100}%`, minWidth: r.n ? 4 : 0, borderRadius: 6, background: "var(--accent)" }} />
          </span>
          <span role="cell" style={{ fontSize: 13, fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.n}<span className="muted" style={{ fontWeight: 600 }}> · {pct(r.n, total)}</span></span>
        </div>
      ))}
    </div>
  );
}

/** People who opened the app, one column per day. Tap or point at a day to read it. */
function Days({ rows }: { rows: Stats["daily"] }) {
  const [at, setAt] = useState<number>(rows.length - 1);
  const max = Math.max(1, ...rows.map((r) => r.active));
  const cur = rows[at];
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 700, minHeight: 20 }}>
        {cur ? <>{day(cur.day, { weekday: "short", day: "numeric", month: "short" })}: {people(cur.active)} opened the app<span className="muted" style={{ fontWeight: 600 }}>{cur.new ? ` · ${cur.new} new` : ""}</span></> : null}
      </div>
      <div role="group" aria-label="People who opened the app, per day" style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96, marginTop: 8, borderBottom: "1px solid var(--soft)" }}>
        {rows.map((r, i) => (
          <button key={r.day} onClick={() => setAt(i)} onPointerEnter={() => setAt(i)} onFocus={() => setAt(i)}
            aria-label={`${day(r.day, { day: "numeric", month: "long" })}: ${people(r.active)}`} aria-pressed={i === at}
            style={{ flex: 1, height: "100%", border: 0, padding: 0, background: "none", display: "flex", alignItems: "flex-end", cursor: "pointer" }}>
            <span style={{ display: "block", width: "100%", height: `${(r.active / max) * 100}%`, minHeight: r.active ? 3 : 0, borderRadius: "4px 4px 0 0", background: "var(--accent)", opacity: i === at ? 1 : 0.55 }} />
          </button>
        ))}
      </div>
      <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, paddingTop: 4 }}>
        <span>{rows[0] ? day(rows[0].day, { day: "numeric", month: "short" }) : ""}</span><span>most in a day: {max}</span><span>today</span>
      </div>
    </div>
  );
}

/** Of the people who started in a given week: how many opened the app again in each of the weeks after. */
function Cohorts({ rows }: { rows: Cohort[] }) {
  if (!rows.length) return <div className="muted" style={{ fontSize: 14 }}>Nobody has started in the last eight weeks.</div>;
  const cell = (n: number, of: number) => of === 0
    ? <td className="muted" style={{ textAlign: "center", padding: "8px 4px", fontSize: 13 }}>–</td>
    : <td style={{ textAlign: "center", padding: "8px 4px", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", background: `color-mix(in srgb, var(--accent) ${Math.round((n / of) * 34)}%, transparent)`, borderRadius: 8 }}>{pct(n, of)}<div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{n} of {of}</div></td>;
  return (
    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 2 }}>
      <thead><tr className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
        <th style={{ textAlign: "left", padding: "0 4px 4px", fontWeight: 700 }}>Started week of</th><th style={{ fontWeight: 700 }}>People</th><th style={{ fontWeight: 700 }}>Week 1</th><th style={{ fontWeight: 700 }}>Week 2</th><th style={{ fontWeight: 700 }}>Week 3</th><th style={{ fontWeight: 700 }}>Week 4</th>
      </tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.week}>
            <th scope="row" style={{ textAlign: "left", padding: "8px 4px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{day(c.week, { day: "numeric", month: "short" })}</th>
            <td style={{ textAlign: "center", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{c.size}</td>
            {cell(c.w1, c.n1)}{cell(c.w2, c.n2)}{cell(c.w3, c.n3)}{cell(c.w4, c.n4)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
    <div><h2 className="h2">{title}</h2>{note && <div className="muted" style={{ fontSize: "var(--t-sub)", lineHeight: 1.4, marginTop: 2 }}>{note}</div>}</div>
    {children}
  </section>
);
const Facts = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {rows.map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}><span className="muted">{k}</span><span style={{ fontWeight: 800, textAlign: "right" }}>{v}</span></div>)}
  </div>
);

/** How Frejas is being used. Only for whoever looks after it; everyone else gets "not found". */
export default function Insights() {
  const { userId } = useApp();
  const [s, setS] = useState<Stats | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    const { data, error } = await supabase().rpc("admin_stats");
    setBusy(false);
    if (error || !data) { setDenied(true); return; }
    setS(data as Stats);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (denied) return (
    <main className="page"><BackBar />
      <div className="card" style={{ padding: 24, textAlign: "center" }}><div className="h1" style={{ fontSize: 22 }}>Page not found</div></div>
    </main>
  );
  if (!s) return <main className="page"><BackBar title="Insights" /><div className="skeleton" style={{ height: 420 }} /></main>;

  const total = s.people.total;
  const upTo = (d: Dist[], last: number) => d.map((r) => ({ name: r.n === last ? `${r.n} or more` : String(r.n), n: r.people }));
  const posthog = process.env.NEXT_PUBLIC_POSTHOG_KEY ? "https://eu.posthog.com" : null;

  return (
    <main className="page" style={{ gap: 12, paddingBottom: 60 }}>
      <BackBar title="Insights" right={<button className="icon-btn" aria-label="Refresh" disabled={busy} onClick={load}><Icon name="repeat" /></button>} />
      <div className="muted" style={{ fontSize: "var(--t-sub)", lineHeight: 1.45, padding: "0 4px" }}>
        As of {new Date(s.as_of).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Your own account{s.inbox.left_out ? ` and your ${s.inbox.left_out === 1 ? "test account" : `${s.inbox.left_out} test accounts`}` : ""} {s.inbox.left_out ? "are" : "is"} left out. With few people, one person moves a percentage a lot, so the counts are always shown too.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Tile label="People" value={total} sub={`${s.people.accounts} with an account · ${s.people.guests} without`} />
        <Tile label="New, last 7 days" value={s.people.new_7d} sub={versus(s.people.new_7d, s.people.new_prev_7d)} />
        <Tile label="Opened the app, last 7 days" value={s.active.d7} sub={`${pct(s.active.d7, total)} of everyone · ${versus(s.active.d7, s.active.prev_d7)}`} />
        <Tile label="Opened the app today" value={s.active.today} sub={`${s.active.d30} in the last 30 days`} />
      </div>
      <Tile label="Came back after their first day" value={pct(s.came_back.n, s.came_back.of)} sub={s.came_back.of ? `${s.came_back.n} of the ${s.came_back.of} who started at least two days ago` : "Nobody has been here two days yet"} />

      <Section title="Opened the app, day by day" note="The last 28 days. Before 3 October a day only counts if something was ticked, checked in or written.">
        <Days rows={s.daily} />
      </Section>

      <Section title="Do they come back?" note="Of the people who started in a week: how many opened the app again one, two, three and four weeks later. A dash means that week isn't over yet.">
        <Cohorts rows={s.cohorts} />
      </Section>

      <Section title="Habits per person" note="Their own habits that aren't archived. Habits that came with a challenge aren't counted, as in the limits.">
        <Bars label="How many people have each number of habits" total={total} rows={upTo(s.habits.dist, 7)} />
        <Facts rows={[["Average", s.habits.avg ?? "–"], ["The person in the middle has", s.habits.median ?? "–"], ["Ticks in the last 7 days", `${s.habits.ticks_7d} by ${people(s.habits.tickers_7d)}`]]} />
      </Section>

      <Section title="Challenges per person" note="Ongoing ones only.">
        <div className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Challenges they started</div>
        <Bars label="How many people started each number of challenges" total={total} rows={upTo(s.challenges.own_dist, 3)} />
        <div className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Challenges others started that they are in</div>
        <Bars label="How many people joined each number of challenges" total={total} rows={upTo(s.challenges.joined_dist, 3)} />
        <Facts rows={[
          ["In at least one challenge", `${s.challenges.in_any} · ${pct(s.challenges.in_any, total)}`],
          ["Ongoing: solo · with friends", `${s.challenges.ongoing_solo} · ${s.challenges.ongoing_friends}`],
          ["Check-ins in the last 7 days", `${s.challenges.checkins_7d} by ${people(s.challenges.checkers_7d)}`],
        ]} />
      </Section>

      <Section title="Friends and invitations">
        <Facts rows={[
          ["Have at least one friend", `${s.friends.with_any} · ${pct(s.friends.with_any, total)}`],
          ["Friendships in all", s.friends.friendships],
          ["Invitations sent inside the app", `${s.friends.invites_sent} · from ${s.friends.challenges_inviting} challenges`],
          ["Comments in the last 7 days", s.friends.comments_7d],
        ]} />
        <div className="muted" style={{ fontSize: "var(--t-sub)", lineHeight: 1.4 }}>Links shared outside the app (messages, social media) can&apos;t be counted here; what they lead to is under &quot;How people arrived&quot;.</div>
      </Section>

      <Section title="How people arrived" note="Noted when someone picks their name. People from before 3 October are 'not known'.">
        <Bars label="How people arrived" total={total} rows={[
          { name: "On their own", n: s.origin.direct }, { name: "Challenge link", n: s.origin.challenge }, { name: "Friend link", n: s.origin.friend }, { name: "Not known", n: s.origin.unknown },
        ]} />
        <Facts rows={[["People whose link brought someone in", s.origin.recruiters]]} />
      </Section>

      <Section title="Without an account">
        <Facts rows={[
          ["Started without an account", s.guests.started],
          ["…and saved it with an email later", `${s.guests.saved} · ${pct(s.guests.saved, s.guests.started)}`],
          ["Using Frejas without an account now", s.people.guests],
          ["Started but never picked a name", s.people.unnamed],
        ]} />
      </Section>

      <Section title="Phones and sharing">
        <Facts rows={[
          ["Have notifications on (iPhone app)", `${s.notifications.phones} · ${pct(s.notifications.phones, total)}`],
          ["Said yes to sharing how they use the app", s.usage.yes],
          ["Said no", s.usage.no],
          ["On the paid level", s.people.plus],
        ]} />
      </Section>

      <div className="card group">
        <Link href="/admin/questions" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="comment" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Questions to everyone</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{s.inbox.questions_open ? `${s.inbox.questions_open} open` : "None open"}</div></div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
        <Link href="/admin/feedback" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="mail" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Feedback</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{s.inbox.feedback_open ? `${s.inbox.feedback_open} new` : "Nothing new"}</div></div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
        {posthog && <a href={posthog} target="_blank" rel="noreferrer" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="stats" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Screens and taps</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Which pages are used, and the last thing before someone leaves. Opens PostHog.</div></div><Icon name="right" size={16} color="var(--ink-2)" /></a>}
      </div>
    </main>
  );
}
