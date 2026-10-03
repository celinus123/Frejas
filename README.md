# Frejas

Small habits, better together. A habit tracker where habits can become friendly challenges.

Web app (installable on the phone's home screen) built with Next.js and Supabase.

## What's in version 0.1

- Start with just a name, no account needed; add an email later to keep everything (or sign in with a 6-digit email code from the start, no passwords)
- Habits: daily, specific days, times a week, every other week, monthly; private or visible to friends
- Today: week strip, one-tap check-off, flexible habits under "This week"
- Stats: week, month and year, tap a day to fill it in
- Challenges: own goals (ranked by % of days at goal) or a shared goal, optional unit (steps, km, minutes), stake, extra stats
- Invite by link, join with your own goal (goals lock when the challenge starts)
- Check-in with date, amount, optional photo (GPS data stripped) and comment; linked habits count automatically
- Feed in two columns with likes, profile, settings (light / dark / auto), data export, account deletion

Not yet: chat, comments, push reminders, Apple/Google sign-in.

## Setup

### 1. Database (Supabase)

In the Supabase dashboard → **SQL Editor** → **New query**, run these files once, in order:

1. `supabase/schema.sql`
2. `supabase/002_account_deletion.sql`
3. `supabase/003_challenges_v2.sql` (solo challenges, schedules, drafts, covers, invites, join requests, chat)

### 2. Sign-in email

**Authentication → Sign In / Providers → Email**: keep Email on, set *Email OTP Length* to `6` and *Email OTP Expiration* to `600`.

**Authentication → Emails → Magic Link** template, so it sends a code instead of a link:

- Subject: `Your Frejas code: {{ .Token }}`
- Body: `<p>Your sign-in code is <strong>{{ .Token }}</strong>. It expires in 10 minutes.</p>`

**Starting without an account** (optional). Turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins** and, on the same page, **Allow manual linking**. The first screen then offers "Get started" with only a name, and invitation and friend links work without an email. The app asks the sign-in service whether this is on, so the buttons appear when the switch is flipped and not before. A guest is an ordinary user with no email; "Save my account" in Settings adds one. For that email, paste `supabase/emails/save-account.html` into **Authentication → Emails → Change Email Address** with the subject `Your Frejas code: {{ .Token }}`. Supabase limits new guests to 30 an hour per network; add a CAPTCHA (Authentication → Attack Protection) before the app is public.

Before inviting friends, add your own email sender under **Authentication → Emails → SMTP Settings** (for example Resend). The built-in sender is only for testing.

### 3. Hosting (Vercel)

1. In Vercel: **Add New → Project** → import this GitHub repo.
2. Under **Environment Variables**, add the three values from Supabase → **Project Settings → API Keys** / **Data API**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (or legacy `anon` key) |
   | `SUPABASE_SECRET_KEY` | Secret key (or legacy `service_role` key) — **never** share or prefix with `NEXT_PUBLIC_` |

3. **Deploy**.
4. Back in Supabase → **Authentication → URL Configuration**, set *Site URL* to your Vercel address (e.g. `https://orbit-xyz.vercel.app`).

### 4. On your phone

Open the address in Safari → Share → **Add to Home Screen**.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

## Security notes

- Every table has Row Level Security; the rules live in `supabase/schema.sql`.
- New tables are not exposed automatically; access is granted explicitly.
- The secret key is used only in `app/api/delete-account/route.ts`, on the server.
- Photos live in private buckets and are served through links that expire after an hour.
- `app/privacy` and `app/terms` are drafts — fill in the bracketed parts before inviting people outside your circle.

## App Store and Google Play

The iPhone and Android apps are a native shell (Capacitor 8) that loads https://frejas.app, so publishing to Vercel
updates the apps too. Only changes to the shell itself (icons, permissions, new native plugins) need a new store build.

- `capacitor.config.ts`: app id `app.frejas`, name, and the site it loads. `native-shell/` is the offline page.
- `ios/`, `android/`: the native projects. Icons and splash screens come from `assets/` via `npx capacitor-assets generate`.
- `codemagic.yaml`: cloud builds (no Mac needed) that upload to TestFlight and Google Play internal testing.
- App reviewers sign in with `review@frejas.app` and a password (they can't receive our email codes).
  Create that user in Supabase → Authentication → Users → Add user, with "Auto confirm" on.

After changing native settings or adding a plugin: `npx cap sync`.

### Levels and limits

`supabase/019_levels.sql`. Three levels: **guest** (no account), **free** (an account) and **plus** (paid). What each has room for is a row in `plan_limits`: habits of your own, challenges you started, and challenges others started that you are in. Guest and free start at 5, 1 and 2; plus has no limits. To change a number: `update plan_limits set habits = 7 where level = 'free';`. Habits that came with a challenge don't count, solo challenges and drafts do, and nothing anyone already has is taken away. The database refuses anything over the limit; the app asks `my_limits()` first and shows a notice instead of a form. To give someone the paid level by hand: `insert into user_plans (user_id, note) values ('<their id>', 'why');`.

### Notifications

- From other people (invitation, request to join, comment, new friend): the app calls `/api/notify`, which looks the event up in
  the database and sends to Apple (`lib/server/apns.ts`). It needs three settings in Vercel, entered by hand and never shared:
  `APNS_KEY` (the text of the .p8 key from Apple Developer → Keys, with "Apple Push Notifications service" ticked),
  `APNS_KEY_ID` (shown next to the key) and `APNS_TEAM_ID` (Apple Developer → Membership). Without them nothing is sent.
- The app id `app.frejas` needs the Push Notifications capability (Apple Developer → Identifiers), and the provisioning profile
  has to be made again afterwards, or the build is refused.
- Reminders are set on the phone itself from each habit's reminder time (`lib/push.ts`, `syncReminders`). No server involved.
- Android needs Firebase and its own build; `lib/push.ts` is switched on for the iPhone app only until then.
