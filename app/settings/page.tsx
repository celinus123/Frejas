"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Avatar, BackBar, Sheet, Switch } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/photos";
import { myBlocks, unblockUser, type Blocked } from "@/lib/safety";
import type { Profile } from "@/lib/types";

export default function Settings() {
  const router = useRouter();
  const { userId, session, profile, refreshProfile, setTheme, toast } = useApp();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [blocks, setBlocks] = useState<Blocked[]>([]);
  const [blocksOpen, setBlocksOpen] = useState(false);
  useEffect(() => { if (userId) myBlocks().then(setBlocks); }, [userId]);
  if (!profile || !userId || !session) return null;
  const email = session.user.email ?? "";

  async function update(fields: Partial<Profile>) {
    await supabase().from("profiles").update(fields).eq("id", userId!);
    await refreshProfile();
  }
  async function theme(t: Profile["theme"]) { setTheme(t); await update({ theme: t }); }
  async function saveName() { if (name.trim() && name.trim() !== profile!.display_name) { await update({ display_name: name.trim() }); toast({ text: "Name saved." }); } }
  async function photo(f: File) { const p = await uploadAvatar(f, userId!); await update({ avatar_path: p }); }

  async function exportData() {
    const sb = supabase();
    const [p, h, l, m, c] = await Promise.all([
      sb.from("profiles").select("*").eq("id", userId!),
      sb.from("habits").select("*").eq("owner_id", userId!),
      sb.from("habit_logs").select("*").eq("user_id", userId!),
      sb.from("challenge_members").select("*").eq("user_id", userId!),
      sb.from("check_ins").select("*").eq("user_id", userId!),
    ]);
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), email, profile: p.data, habits: h.data, habit_logs: l.data, challenges_joined: m.data, check_ins: c.data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "frejas-my-data.json"; a.click();
    URL.revokeObjectURL(a.href);
  }

  async function unblock(b: Blocked) {
    try { await unblockUser(userId!, b.id); } catch (e) { toast({ text: (e as Error).message }); return; }
    setBlocks((all) => all.filter((x) => x.id !== b.id));
    toast({ text: <><b>{b.display_name || "They"}</b> can reach you again. You&apos;re not friends until one of you adds the other.</> });
  }

  async function logout() { await supabase().auth.signOut(); router.replace("/welcome"); }

  async function deleteAccount() {
    setBusy(true);
    const res = await fetch("/api/delete-account", { method: "POST", headers: { Authorization: `Bearer ${session!.access_token}` } });
    if (!res.ok) { setBusy(false); toast({ text: "Couldn't delete the account. Try again or contact us." }); return; }
    await supabase().auth.signOut();
    try { localStorage.removeItem("orbit-theme"); } catch {}
    router.replace("/welcome");
  }

  const seg = (
    <div style={{ display: "flex", padding: 3, borderRadius: 14, background: "var(--soft-l)" }}>
      {(["light", "dark", "auto"] as const).map((t) => (
        <button key={t} onClick={() => theme(t)} aria-pressed={profile.theme === t}
          style={{ padding: "6px 11px", borderRadius: 11, border: 0, fontSize: 12.5, fontWeight: profile.theme === t ? 800 : 600, background: profile.theme === t ? "var(--surface)" : "none", boxShadow: profile.theme === t ? "var(--shadow)" : "none", color: profile.theme === t ? "var(--ink)" : "var(--ink-2)", textTransform: "capitalize" }}>{t}</button>
      ))}
    </div>
  );

  return (
    <main className="page" style={{ gap: 10 }}>
      <BackBar title="Settings" />
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 0" }}>
        <button onClick={() => fileRef.current?.click()} aria-label="Change photo" style={{ border: 0, background: "none", padding: 0, position: "relative" }}>
          <Avatar name={profile.display_name} path={profile.avatar_path} size={64} />
          <span style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", border: "3px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="camera" size={13} stroke={2} /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && photo(e.target.files[0])} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="field" style={{ minHeight: 46 }}><input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} aria-label="Name" /></label>
          <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "6px 4px 0", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
        </div>
      </div>

      <div className="label">Appearance</div>
      <div className="card group"><div className="row"><Icon name="moon" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Theme</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Auto follows your phone</div></div>{seg}</div></div>

      <div className="label">Privacy</div>
      <div className="card group">
        <div className="row"><Icon name="lock" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>New habits are private</div>
          <Switch on={profile.new_habits_private} onChange={(v) => update({ new_habits_private: v })} label="New habits are private" /></div>
        <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={exportData}>
          <Icon name="download" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Download my data</div></button>
        <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => setBlocksOpen(true)}>
          <Icon name="block" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Blocked people</div><span className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>{blocks.length || "None"}</span><Icon name="right" size={16} color="var(--ink-2)" /></button>
      </div>

      <div className="label">About</div>
      <div className="card group">
        <Link href="/privacy" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="shield" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Privacy policy</div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
        <Link href="/terms" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="edit" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Terms</div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
        <a href="mailto:hello@frejas.app" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="mail" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Contact us</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>hello@frejas.app</div></div><Icon name="right" size={16} color="var(--ink-2)" /></a>
      </div>

      <div className="card group" style={{ marginTop: 8 }}>
        <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={logout}><Icon name="logout" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Log out</div></button>
        <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => setConfirmDelete((v) => !v)}><Icon name="trash" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Delete account</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Permanently removes your data</div></div></button>
      </div>

      {confirmDelete && (
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="h1" style={{ fontSize: 22 }}>We&apos;ll delete everything</div>
          <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Your habits, history, check-ins, photos and profile are removed right away. Challenges you&apos;re in keep going for the others. This can&apos;t be undone.</div>
          <button className="btn btn-white" onClick={exportData}><Icon name="download" />Download my data first</button>
          <div className="label">Type your email to confirm</div>
          <label className="field"><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} aria-label="Type your email to confirm" autoCapitalize="none" /></label>
          <button className="btn" style={{ background: "var(--ink)", color: "var(--bg)" }} disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()} onClick={deleteAccount}>{busy ? "Deleting…" : "Delete my account"}</button>
        </section>
      )}
      <div className="muted" style={{ textAlign: "center", fontSize: "var(--t-sub)", marginTop: 10 }}>Frejas · version 0.1</div>

      <Sheet open={blocksOpen} onClose={() => setBlocksOpen(false)} label="Blocked people">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="h1" style={{ fontSize: 22 }}>Blocked people</div>
          <button className="icon-btn" aria-label="Close" onClick={() => setBlocksOpen(false)}><Icon name="x" /></button>
        </div>
        {blocks.length ? (
          <div className="card group">
            {blocks.map((b) => (
              <div key={b.id} className="row">
                <Avatar name={b.display_name} size={38} />
                <div style={{ flex: 1, minWidth: 0, fontSize: "var(--t-title)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.display_name || "Someone"}</div>
                <button className="btn btn-soft btn-sm" onClick={() => unblock(b)}>Unblock</button>
              </div>
            ))}
          </div>
        ) : <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Nobody. To block someone, tap their picture in the Feed, or the three dots on something they posted.</div>}
        <p className="muted" style={{ margin: 0, fontSize: "var(--t-sub)", lineHeight: 1.45 }}>People you block aren&apos;t told. You stop seeing each other&apos;s posts, comments and messages.</p>
      </Sheet>
    </main>
  );
}
