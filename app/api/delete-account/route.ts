import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { removeUser } from "@/lib/server/removeUser";

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

  const { error } = await removeUser(admin, userData.user.id);
  if (error) return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
