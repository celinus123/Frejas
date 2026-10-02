import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { removeUser } from "@/lib/server/removeUser";

// The reports page for whoever looks after Frejas. Everything here runs on the server with the secret key,
// and only after checking that the person asking is on the list in the `admins` table.

async function gate(req: Request): Promise<{ admin: SupabaseClient; uid: string } | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: row } = await admin.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return { admin, uid: data.user.id };
}

interface Report {
  id: string; reporter_id: string | null; kind: string; target_id: string | null; target_user: string | null; day: string | null; challenge_id: string | null;
  reason: string; details: string | null; snapshot: string | null; status: string; created_at: string; handled_at: string | null; handled_action: string | null;
}
const TABLE: Record<string, string> = { check_in: "check_ins", comment: "comments", day_comment: "day_comments", message: "messages" };

export async function GET(req: Request) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const { admin } = g;
  const status = new URL(req.url).searchParams.get("status") === "handled" ? "handled" : "open";
  const { data } = await admin.from("reports").select("*").eq("status", status).order("created_at", { ascending: status === "open" }).limit(100);
  const reports = (data ?? []) as Report[];

  const userIds = [...new Set(reports.flatMap((r) => [r.reporter_id, r.target_user]).filter(Boolean))] as string[];
  const chIds = [...new Set(reports.map((r) => r.challenge_id).filter(Boolean))] as string[];
  const [people, challenges, earlier] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id, display_name").in("id", userIds) : { data: [] },
    chIds.length ? admin.from("challenges").select("id, name").in("id", chIds) : { data: [] },
    userIds.length ? admin.from("reports").select("target_user").in("target_user", userIds) : { data: [] },
  ]);
  const name = new Map(((people.data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  const chName = new Map(((challenges.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const counts = new Map<string, number>();
  for (const r of (earlier.data ?? []) as { target_user: string }[]) counts.set(r.target_user, (counts.get(r.target_user) ?? 0) + 1);

  // is the reported thing still there, and does it have a photo to look at?
  const out = await Promise.all(reports.map(async (r) => {
    let exists: boolean | null = null, photo: string | null = null;
    const table = TABLE[r.kind];
    if (table && r.target_id) {
      const { data: row } = await admin.from(table).select(r.kind === "check_in" ? "id, photo_path" : "id").eq("id", r.target_id).maybeSingle();
      exists = !!row;
      const path = (row as { photo_path?: string | null } | null)?.photo_path;
      if (path) photo = (await admin.storage.from("photos").createSignedUrl(path, 600)).data?.signedUrl ?? null;
    }
    return {
      id: r.id, kind: r.kind, reason: r.reason, details: r.details, snapshot: r.snapshot, day: r.day, created_at: r.created_at,
      handled_at: r.handled_at, handled_action: r.handled_action, exists, photo,
      target: r.target_user ? { id: r.target_user, name: name.get(r.target_user) || "Someone", reports: counts.get(r.target_user) ?? 1 } : null,
      reporter: r.reporter_id ? { id: r.reporter_id, name: name.get(r.reporter_id) || "Someone" } : null,
      challenge: r.challenge_id ? chName.get(r.challenge_id) ?? null : null,
    };
  }));
  return NextResponse.json({ reports: out });
}

export async function POST(req: Request) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const { admin, uid } = g;
  const { id, action } = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !["keep", "remove", "remove_account"].includes(action ?? "")) return NextResponse.json({ error: "What should happen?" }, { status: 400 });
  const { data } = await admin.from("reports").select("*").eq("id", id).maybeSingle();
  const r = data as Report | null;
  if (!r) return NextResponse.json({ error: "That report isn't there any more." }, { status: 404 });
  const done = (handled_action: string) => ({ status: "handled", handled_at: new Date().toISOString(), handled_action });

  if (action === "keep") {
    await admin.from("reports").update(done("kept")).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    const table = TABLE[r.kind];
    if (!table || !r.target_id) return NextResponse.json({ error: "There is nothing to remove for this kind of report." }, { status: 400 });
    if (r.kind === "check_in") {
      const { data: ci } = await admin.from("check_ins").select("photo_path").eq("id", r.target_id).maybeSingle();
      const path = (ci as { photo_path: string | null } | null)?.photo_path;
      if (path) await admin.storage.from("photos").remove([path]);
    }
    const { error } = await admin.from(table).delete().eq("id", r.target_id);
    if (error) return NextResponse.json({ error: "Couldn't remove it. Try again." }, { status: 500 });
    // every waiting report about the same thing is settled at once
    await admin.from("reports").update(done("removed")).eq("status", "open").eq("kind", r.kind).eq("target_id", r.target_id);
    return NextResponse.json({ ok: true });
  }

  // remove_account
  if (!r.target_user) return NextResponse.json({ error: "That account is already gone." }, { status: 400 });
  if (r.target_user === uid) return NextResponse.json({ error: "That is your own account." }, { status: 400 });
  const { data: isAdmin } = await admin.from("admins").select("user_id").eq("user_id", r.target_user).maybeSingle();
  if (isAdmin) return NextResponse.json({ error: "That account looks after reports and can't be removed from here." }, { status: 400 });
  // settle the waiting reports about this person first: the link to the account disappears with it
  await admin.from("reports").update(done("account_removed")).eq("status", "open").eq("target_user", r.target_user);
  const { error } = await removeUser(admin, r.target_user);
  if (error) return NextResponse.json({ error: "Couldn't remove the account. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
