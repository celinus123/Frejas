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
  if (((them.notify_off as string[] | null) ?? []).includes(kind)) return skip("switched off");
  if (blocks?.length) return skip("blocked");
  if (found.challenge) {
    const { data: m } = await admin.from("challenge_members").select("muted").eq("challenge_id", found.challenge).eq("user_id", found.to).maybeSingle();
    if (m?.muted) return skip("muted");
  }

  // each thing is told once
  const { error: dup } = await admin.from("push_log").insert({ key: found.key, kind, to_user: found.to });
  if (dup) return skip("already told");
  if (!apnsConfigured()) return skip("no push key yet");

  const { data: phones } = await admin.from("push_tokens").select("token").eq("user_id", found.to).eq("platform", "ios");
  const tokens = ((phones ?? []) as { token: string }[]).map((p) => p.token);
  const { sent, gone } = await sendApns(tokens, found.note);
  if (gone.length) await admin.from("push_tokens").delete().in("token", gone);
  await admin.from("push_log").update({ sent }).eq("key", found.key);
  return NextResponse.json({ ok: true, sent });
}
