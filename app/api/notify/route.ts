import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apnsConfigured, sendApns, type Note } from "@/lib/server/apns";

export const runtime = "nodejs";

// Tells someone's phone that something happened: an invitation, a request to join, a comment, a new friend.
// The app calls this right after the thing was done. Nothing in the request is trusted: who is asking comes from
// their sign-in, and what happened is looked up in the database. If it isn't there, nothing is sent.
type Kind = "invite" | "request" | "comment" | "friend";
interface Found { to: string; key: string; note: Note; challenge?: string }

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function find(admin: SupabaseClient, me: string, name: string, b: Record<string, unknown>): Promise<Found | null> {
  const kind = b.type as Kind;
  if (kind === "invite" && uuid(b.challenge_id) && uuid(b.user_id)) {
    const { data: inv } = await admin.from("challenge_invites").select("user_id").eq("challenge_id", b.challenge_id).eq("user_id", b.user_id).eq("invited_by", me).maybeSingle();
    const { data: c } = await admin.from("challenges").select("name").eq("id", b.challenge_id).maybeSingle();
    if (!inv || !c) return null;
    return { to: b.user_id, key: `invite:${b.challenge_id}:${b.user_id}`, note: { title: `${name} invited you to a challenge`, body: c.name, url: `/challenges/${b.challenge_id}` } };
  }
  if (kind === "request" && uuid(b.challenge_id)) {
    const { data: r } = await admin.from("join_requests").select("user_id").eq("challenge_id", b.challenge_id).eq("user_id", me).maybeSingle();
    const { data: c } = await admin.from("challenges").select("name, creator_id").eq("id", b.challenge_id).maybeSingle();
    if (!r || !c) return null;
    return { to: c.creator_id, key: `request:${b.challenge_id}:${me}`, note: { title: `${name} wants to join`, body: c.name, url: `/challenges/${b.challenge_id}` } };
  }
  if (kind === "comment" && uuid(b.id) && b.on === "checkin") {
    const { data: cm } = await admin.from("comments").select("body, check_in_id").eq("id", b.id).eq("user_id", me).maybeSingle();
    if (!cm) return null;
    const { data: ci } = await admin.from("check_ins").select("user_id, challenge_id").eq("id", cm.check_in_id).maybeSingle();
    if (!ci) return null;
    return { to: ci.user_id, key: `comment:${b.id}`, challenge: ci.challenge_id, note: { title: `${name} commented on your check-in`, body: short(cm.body, 120), url: `/challenges/${ci.challenge_id}` } };
  }
  if (kind === "comment" && uuid(b.id) && b.on === "day") {
    const { data: cm } = await admin.from("day_comments").select("body, owner_id").eq("id", b.id).eq("user_id", me).maybeSingle();
    if (!cm) return null;
    return { to: cm.owner_id, key: `comment:${b.id}`, note: { title: `${name} commented on your habits`, body: short(cm.body, 120), url: "/feed" } };
  }
  if (kind === "friend" && uuid(b.user_id)) {
    const [a, z] = me < b.user_id ? [me, b.user_id] : [b.user_id, me];
    const { data: f } = await admin.from("friendships").select("created_at").eq("user_a", a).eq("user_b", z).maybeSingle();
    if (!f || Date.now() - new Date(f.created_at).getTime() > 10 * 60 * 1000) return null;   // only when it has just happened
    return { to: b.user_id, key: `friend:${a}:${z}`, note: { title: "You have a new friend", body: `${name} opened your friend link.`, url: "/feed" } };
  }
  return null;
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const me = userData.user.id;

  // "Send a test" in Settings: to your own phones, and the answer says exactly what happened
  if (body.type === "test") {
    const { data: own } = await admin.from("push_tokens").select("token").eq("user_id", me).eq("platform", "ios");
    const mineTokens = ((own ?? []) as { token: string }[]).map((p) => p.token);
    if (!apnsConfigured()) return NextResponse.json({ ok: true, sent: 0, phones: mineTokens.length, why: "The push key isn't on the server yet." });
    if (!mineTokens.length) return NextResponse.json({ ok: true, sent: 0, phones: 0, why: "This phone isn't registered for notifications yet." });
    const r = await sendApns(mineTokens, { title: "Frejas", body: "Notifications work. This is your test.", url: "/settings" });
    if (r.gone.length) await admin.from("push_tokens").delete().in("token", r.gone);
    return NextResponse.json({ ok: true, sent: r.sent, phones: mineTokens.length, why: r.sent ? "" : `Apple didn't accept it: ${r.problems.join("; ") || "unknown reason"}` });
  }

  const { data: mine } = await admin.from("profiles").select("display_name").eq("id", me).maybeSingle();
  const found = await find(admin, me, (mine?.display_name as string) || "Someone", body);
  const skip = (why: string) => NextResponse.json({ ok: true, sent: 0, why });
  if (!found) return skip("nothing to tell");
  if (found.to === me) return skip("your own");

  // the person's own choices: this kind switched off, a block between the two, or the challenge muted
  const kind = body.type as Kind;
  const [{ data: them }, { data: blocks }] = await Promise.all([
    admin.from("profiles").select("notify_off").eq("id", found.to).maybeSingle(),
    admin.from("blocks").select("blocker_id").or(`and(blocker_id.eq.${me},blocked_id.eq.${found.to}),and(blocker_id.eq.${found.to},blocked_id.eq.${me})`).limit(1),
  ]);
  if (!them) return skip("no such person");
  if (blocks?.length) return skip("blocked");
  let quiet: string | null = ((them.notify_off as string[] | null) ?? []).includes(kind) ? "switched off" : null;
  if (!quiet && found.challenge) {
    const { data: m } = await admin.from("challenge_members").select("muted").eq("challenge_id", found.challenge).eq("user_id", found.to).maybeSingle();
    if (m?.muted) quiet = "muted";
  }

  // each thing is told once
  const { error: dup } = await admin.from("push_log").insert({ key: found.key, kind, to_user: found.to });
  if (dup) return skip("already told");
  const noted = (note: string, sent = 0) => admin.from("push_log").update({ sent, note }).eq("key", found.key).then(() => {}, () => {});
  // it always goes into the list in the app; the switches and a muted challenge only decide whether the phone is told
  await admin.from("notifications").insert({ user_id: found.to, kind, title: found.note.title, body: found.note.body, url: found.note.url });
  if (quiet) { await noted(quiet); return skip(quiet); }
  if (!apnsConfigured()) { await noted("no push key on the server"); return skip("no push key yet"); }

  const { data: phones } = await admin.from("push_tokens").select("token").eq("user_id", found.to).eq("platform", "ios");
  const tokens = ((phones ?? []) as { token: string }[]).map((p) => p.token);
  if (!tokens.length) { await noted("no phone registered"); return skip("no phone"); }
  const { sent, gone, problems } = await sendApns(tokens, found.note);
  if (gone.length) await admin.from("push_tokens").delete().in("token", gone);
  await noted(problems.length ? `apple: ${problems.join("; ")}` : "sent", sent);
  return NextResponse.json({ ok: true, sent });
}
