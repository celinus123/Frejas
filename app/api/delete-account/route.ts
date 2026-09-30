import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Deletes the signed-in user's account. Runs on the server only, because
// deleting a login needs the secret key, which must never reach the browser.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // Verify who is asking. The id comes from the verified token, never from the request body.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const uid = userData.user.id;

  // Remove the user's photos and avatar files first; database rows cascade when the user is deleted.
  const { data: checkins } = await admin.from("check_ins").select("photo_path").eq("user_id", uid).not("photo_path", "is", null);
  const photoPaths = (checkins ?? []).map((c: { photo_path: string }) => c.photo_path);
  for (let i = 0; i < photoPaths.length; i += 100) await admin.storage.from("photos").remove(photoPaths.slice(i, i + 100));
  const { data: avatars } = await admin.storage.from("avatars").list(uid);
  if (avatars?.length) await admin.storage.from("avatars").remove(avatars.map((f) => `${uid}/${f.name}`));

  // Challenges this user created would otherwise vanish for everyone (creator_id cascades).
  // Hand them over to the longest-standing other member first.
  const { data: created } = await admin.from("challenges").select("id").eq("creator_id", uid);
  for (const c of created ?? []) {
    const { data: next } = await admin.from("challenge_members").select("user_id").eq("challenge_id", c.id).neq("user_id", uid).order("joined_at").limit(1).maybeSingle();
    if (next) await admin.rpc("transfer_challenge", { p_challenge: c.id, p_new_creator: next.user_id });
    else {
      // nobody else is in it, so it is deleted with the user: remove its cover photos too
      const { data: covers } = await admin.storage.from("covers").list(c.id);
      if (covers?.length) await admin.storage.from("covers").remove(covers.map((f) => `${c.id}/${f.name}`));
    }
  }

  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
