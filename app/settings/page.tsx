"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { GuestCard, SaveAccountSheet } from "@/components/SaveAccount";
import { Icon } from "@/components/Icon";
import { Avatar, BackBar, Sheet, Switch } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/photos";
import { myBlocks, unblockUser, type Blocked } from "@/lib/safety";
import { SwipeRow } from "@/components/SwipeRow";
import { ReminderField } from "@/components/ReminderField";
import { NOTE_KINDS, enablePush, forgetPush, hhmm, pushDetails, pushState, syncReminders, testPush, type PushState } from "@/lib/push";
import type { Habit, Profile } from "@/lib/types";

// a habit that has (or, until you leave the page, had) a reminder
interface Reminder { id: string; name: string; when: string; time: string; on: boolean }
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Settings() {
  const router = useRouter();
  const { guest, userId, session, profile, refreshProfile, setTheme, toast, reportsOpen } = useApp();
  const [saveOpen, setSaveOpen] = useState(false);       // a guest adding their email
  const [leaveOpen, setLeaveOpen] = useState(false);     // a guest about to log in to another account
  const [name, setName] = useState(profile?.display_name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [blocks, setBlocks] = useState<Blocked[]>([]);
  const [blocksOpen, setBlocksOpen] = useState(false);
  useEffect(() => { if (userId) myBlocks().then(setBlocks); }, [userId]);
  const [push, setPush] = useState<PushState | null>(null);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase().from("habits").select("id, name, frequency, days, reminder_time").eq("owner_id", userId).is("archived_at", null).not("reminder_time", "is", null).order("reminder_time").then(({ data }) =>
      setReminders(((data ?? []) as Pick<Habit, "id" | "name" | "frequency" | "days" | "reminder_time">[]).map((h) => ({
        id: h.id, name: h.name, time: hhmm(h.reminder_time), on: true,
        when: h.frequency === "specific_days" && h.days?.length ? [...h.days].sort().map((d) => DAY[d - 1]).join(", ") : "Every day",
      }))));
  }, [userId]);
  const [openRem, setOpenRem] = useState<string | null>(null);     // the row that is swiped open
  const [editRem, setEditRem] = useState<Reminder | null>(null);   // the reminder whose time is being changed
  const [editTime, setEditTime] = useState("");
  const resync = async () => {
    const { data } = await supabase().from("habits").select("id, name, frequency, days, reminder_time, archived_at").eq("owner_id", userId!);
    syncReminders((data ?? []) as Parameters<typeof syncReminders>[0]);
  };
  // removing takes it off the habit and out of the list (with a way to undo it)
  async function removeReminder(r: Reminder) {
    const { error } = await supabase().from("habits").update({ reminder_time: null }).eq("id", r.id);
    if (error) { toast({ text: error.message }); return; }
    const before = reminders ?? [];
    setReminders(before.filter((x) => x.id !== r.id)); setEditRem(null);
    toast({ text: <>Reminder for <b>{r.name}</b> removed.</>, undo: async () => { await supabase().from("habits").update({ reminder_time: r.time }).eq("id", r.id); setReminders(before.map((x) => (x.id === r.id ? { ...x, on: true } : x))); resync(); } });
    resync();
  }
  async function saveTime() {
    const r = editRem;
    if (!r) return;
    if (!editTime) return removeReminder(r);
    const { error } = await supabase().from("habits").update({ reminder_time: editTime }).eq("id", r.id);
    if (error) { toast({ text: error.message }); return; }
    setReminders((reminders ?? []).map((x) => (x.id === r.id ? { ...x, time: editTime, on: true } : x)).sort((a, b) => a.time.localeCompare(b.time)));
    setEditRem(null);
    toast({ text: <>You&apos;ll be reminded at <b>{editTime}</b>.</> });
    resync();
  }
  // switching one off removes the time from the habit; it stays in the list until you leave, so it can be switched back on
  async function setReminder(ids: string[], on: boolean) {
    const now = reminders ?? [];
    for (const r of now.filter((x) => ids.includes(x.id))) {
      const { error } = await supabase().from("habits").update({ reminder_time: on ? r.time : null }).eq("id", r.id);
      if (error) { toast({ text: error.message }); return; }
    }
    setReminders(now.map((r) => (ids.includes(r.id) ? { ...r, on } : r)));
    resync();
  }
  const [phone, setPhone] = useState<{ registered: boolean; problem: string | null } | null>(null);
  const checkPhone = () => setTimeout(() => pushDetails().then(setPhone), 2500);   // registering takes the phone a moment
  useEffect(() => { pushState().then((s) => { setPush(s); if (s === "granted") pushDetails().then(setPhone); }); }, []);
  if (!profile || !userId || !session) return null;
  const email = session.user.email ?? "";
  const confirmWord = guest ? "DELETE" : email;   // what has to be typed before everything is deleted

  async function update(fields: Partial<Profile>): Promise<boolean> {
    const { error } = await supabase().from("profiles").update(fields).eq("id", userId!);
    if (error) { toast({ text: error.message }); return false; }
    await refreshProfile();
    return true;
  }
  async function theme(t: Profile["theme"]) { setTheme(t); await update({ theme: t }); }
  async function saveName() {
    if (!name.trim() || name.trim() === profile!.display_name) return;
    if (await update({ display_name: name.trim() })) toast({ text: "Name saved." });
    else setName(profile!.display_name);
  }
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

  async function logout() { await forgetPush(); await supabase().auth.signOut(); router.replace("/welcome"); }

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
          <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "6px 4px 0", overflow: "hidden", textOverflow: "ellipsis" }}>{guest ? "No account yet" : email}</div>
        </div>
      </div>
      {guest && <GuestCard onSave={() => setSaveOpen(true)} />}

      <div className="label">Appearance</div>
      <div className="card group"><div className="row"><Icon name="moon" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Theme</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Auto follows your phone</div></div>{seg}</div></div>

      <div className="label">Notifications</div>
      <div className="card group">
        {push === "prompt" && (
          <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={async () => { const s = await enablePush(); setPush(s); if (s === "granted") checkPhone(); }}>
            <Icon name="bell" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Turn on notifications</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Your phone asks once. You choose below what you hear about.</div></div><Icon name="right" size={16} color="var(--ink-2)" /></button>
        )}
        {push === "old-app" && <div className="row"><Icon name="bell" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Update Frejas to get notifications</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>This version of the app can&apos;t receive them yet.</div></div></div>}
        {push === "granted" && (
          <div className="row"><Icon name="bell" color="var(--primary)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{phone?.registered ? "Notifications are on" : "This phone isn't registered yet"}</div>
              {!phone?.registered && <div className="muted" style={{ fontSize: "var(--t-sub)", wordBreak: "break-word" }}>{phone?.problem ?? "Tap Try again."}</div>}
            </div>
            {phone?.registered
              ? <button className="btn btn-soft btn-sm" onClick={async () => toast({ text: await testPush() })}>Send a test</button>
              : <button className="btn btn-soft btn-sm" onClick={async () => { await enablePush(); checkPhone(); }}>Try again</button>}
          </div>
        )}
        {push === "denied" && <div className="row"><Icon name="bell" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Notifications are off</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Turn them on for Frejas in your iPhone&apos;s Settings.</div></div></div>}
        {NOTE_KINDS.map(([id, label]) => {
          const off = profile.notify_off ?? [];
          return <div key={id} className="row"><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>{label}</div><Switch on={!off.includes(id)} onChange={(v) => update({ notify_off: v ? off.filter((x) => x !== id) : [...off, id] })} label={label} /></div>;
        })}
      </div>
      {push === "unavailable" && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>Notifications arrive in the iPhone app.</div>}

      <div className="label">Reminders</div>
      {reminders?.map((r) => (
        <SwipeRow key={r.id} label={`the reminder for ${r.name}`} open={openRem === r.id} onOpenChange={(o) => setOpenRem(o ? r.id : null)}
          onEdit={() => { setEditTime(r.time); setEditRem(r); }} onDelete={() => removeReminder(r)}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px 9px 16px", borderRadius: 20, minHeight: 60 }}>
            <Icon name="clock" color="var(--primary)" />
            {/* a tap opens the same thing as Edit, for anyone who doesn't think of swiping */}
            <button onClick={() => { setEditTime(r.time); setEditRem(r); }} aria-label={`Change the reminder for ${r.name}`} style={{ flex: 1, minWidth: 0, border: 0, background: "none", padding: 0, textAlign: "left", opacity: r.on ? 1 : 0.55 }}>
              <span style={{ display: "block", fontSize: "var(--t-title)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span className="muted" style={{ display: "block", fontSize: "var(--t-sub)" }}>{r.when} at {r.time}</span>
            </button>
            <Switch on={r.on} onChange={(v) => setReminder([r.id], v)} label={`Reminder for ${r.name}`} />
          </div>
        </SwipeRow>
      ))}
      {reminders && reminders.filter((r) => r.on).length > 1 && <button className="btn" style={{ background: "none", color: "var(--ink-2)", height: 36 }} onClick={() => setReminder(reminders.filter((r) => r.on).map((r) => r.id), false)}>Turn all reminders off</button>}
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>{reminders?.length ? "Swipe a reminder to the left to change the time or remove it." : "No reminders yet. Set one when you edit a habit, or in the menu of a challenge."}</div>

      <div className="label">Privacy</div>
      <div className="card group">
        <div className="row"><Icon name="lock" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>New habits are private</div>
          <Switch on={profile.new_habits_private} onChange={(v) => update({ new_habits_private: v })} label="New habits are private" /></div>
        <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={exportData}>
          <Icon name="download" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Download my data</div></button>
        <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => setBlocksOpen(true)}>
          <Icon name="block" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Blocked people</div><span className="muted" style={{ fontSize: "var(--t-sub)", fontWeight: 700 }}>{blocks.length || "None"}</span><Icon name="right" size={16} color="var(--ink-2)" /></button>
      </div>

      {reportsOpen !== null && (
        <>
          <div className="label">Looking after Frejas</div>
          <div className="card group">
            <Link href="/admin/reports" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="flag" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Reports</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{reportsOpen ? `${reportsOpen} waiting · answer within 24 hours` : "Nothing is waiting"}</div></div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
          </div>
        </>
      )}

      <div className="label">About</div>
      <div className="card group">
        <Link href="/privacy" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="shield" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Privacy policy</div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
        <Link href="/terms" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="edit" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Terms</div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
        <Link href="/support" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="comment" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Help and questions</div><Icon name="right" size={16} color="var(--ink-2)" /></Link>
        <a href="mailto:hello@frejas.app" className="row" style={{ color: "inherit", textDecoration: "none" }}><Icon name="mail" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Contact us</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>hello@frejas.app</div></div><Icon name="right" size={16} color="var(--ink-2)" /></a>
      </div>

      <div className="card group" style={{ marginTop: 8 }}>
        {guest
          ? <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => setLeaveOpen(true)}><Icon name="logout" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Log in to an account</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>If you already have one</div></div></button>
          : <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={logout}><Icon name="logout" color="var(--primary)" /><div style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Log out</div></button>}
        <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => setConfirmDelete((v) => !v)}><Icon name="trash" color="var(--primary)" /><div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{guest ? "Delete everything" : "Delete account"}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Permanently removes your data</div></div></button>
      </div>

      {confirmDelete && (
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="h1" style={{ fontSize: 22 }}>We&apos;ll delete everything</div>
          <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Your habits, history, check-ins, photos and profile are removed right away. Challenges you&apos;re in keep going for the others. This can&apos;t be undone.</div>
          <button className="btn btn-white" onClick={exportData}><Icon name="download" />Download my data first</button>
          <div className="label">{guest ? "Type DELETE to confirm" : "Type your email to confirm"}</div>
          <label className="field"><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmWord} aria-label={guest ? "Type DELETE to confirm" : "Type your email to confirm"} autoCapitalize="none" /></label>
          <button className="btn" style={{ background: "var(--ink)", color: "var(--bg)" }} disabled={busy || !confirmWord || typed.trim().toLowerCase() !== confirmWord.toLowerCase()} onClick={deleteAccount}>{busy ? "Deleting…" : guest ? "Delete everything" : "Delete my account"}</button>
        </section>
      )}
      <div className="muted" style={{ textAlign: "center", fontSize: "var(--t-sub)", marginTop: 10 }}>Frejas · version 0.1{process.env.NEXT_PUBLIC_BUILD_ID && process.env.NEXT_PUBLIC_BUILD_ID !== "dev" ? ` · ${process.env.NEXT_PUBLIC_BUILD_ID.slice(0, 7)}` : ""}</div>

      <SaveAccountSheet open={saveOpen} onClose={() => setSaveOpen(false)} />
      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} label="Log in to an account">
        <div className="h1" style={{ fontSize: 22 }}>Log in to an account?</div>
        <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>What you have made here without an account stays behind and can&apos;t be opened again. If you want to keep it, save it with your email instead.</p>
        <button className="btn btn-primary" onClick={() => { setLeaveOpen(false); setSaveOpen(true); }}>Save this with my email</button>
        <button className="btn btn-soft" onClick={logout}>Leave this and log in</button>
      </Sheet>
      <Sheet open={!!editRem} onClose={() => setEditRem(null)} label="Change the reminder">
        {editRem && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div className="h1" style={{ fontSize: 22, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editRem.name}</div>
              <button className="icon-btn" aria-label="Close" onClick={() => setEditRem(null)}><Icon name="x" /></button>
            </div>
            <ReminderField value={editTime} onChange={setEditTime} when={editRem.when} />
            <button className="btn btn-primary" onClick={saveTime}><Icon name="check" stroke={2.4} />{editTime ? "Save" : "Remove the reminder"}</button>
            <button className="btn btn-soft" onClick={() => removeReminder(editRem)}>Remove the reminder</button>
          </>
        )}
      </Sheet>

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
