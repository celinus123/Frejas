import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Sends an email to the people who run Frejas when someone reports something.
// The report itself is already saved by the app; this only makes sure it is seen in time.
// Runs on the server because it reads reports (nobody signed in can) and holds the mail key.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Which report?" }, { status: 400 });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // only the reporter's own report, and only once
  const { data: r } = await admin.from("reports").select("*").eq("id", id).eq("reporter_id", userData.user.id).is("notified_at", null).maybeSingle();
  if (!r) return NextResponse.json({ ok: true, mailed: false });

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ ok: true, mailed: false });   // no mail key yet: the report waits in the database

  const ids = [r.reporter_id, r.target_user].filter(Boolean) as string[];
  const { data: people } = await admin.from("profiles").select("id, display_name").in("id", ids);
  const name = (uid: string | null) => (people ?? []).find((p: { id: string; display_name: string }) => p.id === uid)?.display_name || "(no name)";
  const challenge = r.challenge_id ? (await admin.from("challenges").select("name").eq("id", r.challenge_id).maybeSingle()).data?.name : null;
  const lines = [
    `What: ${r.kind}${r.day ? ` (${r.day})` : ""}`,
    `Why: ${r.reason}`,
    r.details ? `The reporter wrote: ${r.details}` : null,
    `It said: ${r.snapshot ?? "(nothing saved)"}`,
    challenge ? `Challenge: ${challenge}` : null,
    "",
    `Posted by: ${name(r.target_user)} · ${r.target_user}`,
    `Reported by: ${name(r.reporter_id)} · ${r.reporter_id} · ${userData.user.email ?? ""}`,
    "",
    `Report: ${r.id}`,
    r.target_id ? `Reported row: ${r.target_id}` : null,
    `Sent: ${r.created_at}`,
  ].filter((x) => x !== null).join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REPORTS_FROM ?? "Frejas <noreply@frejas.app>",
      to: [process.env.REPORTS_TO ?? "hello@frejas.app"],
      subject: `Report: ${r.reason} · ${r.kind} from ${name(r.target_user)}`,
      text: lines,
    }),
  });
  if (!res.ok) return NextResponse.json({ ok: true, mailed: false });
  await admin.from("reports").update({ notified_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, mailed: true });
}
