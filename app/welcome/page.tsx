"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Icon } from "@/components/Icon";
import { Avatars } from "@/components/ui";
import { useApp } from "@/components/AppProvider";
import { uploadAvatar } from "@/lib/photos";
import { FrejasLockup } from "@/components/Logo";
import { isNative } from "@/lib/native";
import { StakeIcon, stakeText } from "@/components/Stake";

// App Store and Google Play reviewers can't receive our email codes, so this one account signs in with a password.
const REVIEW_EMAIL = "review@frejas.app";

type Step = "start" | "email" | "code" | "name";
interface Invite { name: string; starts_on: string; ends_on: string; stake: string | null; member_names: string[] }

function Welcome() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get("invite");
  const friend = params.get("friend");
  const { session, profile, refreshProfile, userId } = useApp();
  const [step, setStep] = useState<Step>(params.get("step") === "name" ? "name" : "start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [inv, setInv] = useState<Invite | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const next = invite ? `/join/${invite}` : friend ? `/add/${friend}` : "/";

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get("error_code") || h.get("error")) {
      setErr(h.get("error_code") === "otp_expired" || /expired|invalid/i.test(h.get("error_description") ?? "")
        ? "That sign-in link has already been used or has expired. Send yourself a new one."
        : h.get("error_description") ?? "Sign-in didn't work. Try again.");
      setStep("email");
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    if (invite) supabase().rpc("get_invite", { p_token: invite }).then(({ data }) => setInv((data as Invite[] | null)?.[0] ?? null));
  }, [invite]);

  // Already signed in: continue, or ask for a name if missing.
  useEffect(() => {
    if (!session || !profile) return;
    if (!profile.display_name) setStep("name");
    else if (step !== "name") router.replace(next);
  }, [session, profile, step, router, next]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const isReview = email.trim().toLowerCase() === REVIEW_EMAIL;

  async function reviewSignIn() {
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr("That password doesn't match.");
  }

  async function sendCode() {
    if (isReview) return reviewSignIn();
    setBusy(true); setErr(null);
    const back = `${window.location.origin}/welcome${invite ? `?invite=${invite}` : friend ? `?friend=${friend}` : ""}`;
    const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: back } });
    setBusy(false);
    if (error) {
      const limited = error.status === 429 || /rate limit|only request this after/i.test(error.message);
      return setErr(limited ? "Too many emails in a short time. Wait a little and try again, or use the last email we sent you." : error.message);
    }
    setStep("code"); setCode(""); setResendIn(45);
  }

  async function verify(value: string) {
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: value, type: "email" });
    setBusy(false);
    if (error) { setErr("That code didn't work. Check it, or send a new one."); setCode(""); }
    // On success the session listener loads the profile and the effect above moves on.
  }

  async function saveName() {
    if (!userId || !name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const avatar_path = photo ? await uploadAvatar(photo, userId) : null;
      const { error } = await supabase().from("profiles").update({ display_name: name.trim(), ...(avatar_path ? { avatar_path } : {}) }).eq("id", userId);
      if (error) throw error;
      await refreshProfile();
      router.replace(next);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  const wrap = (children: React.ReactNode) => (
    <main className="page" style={{ minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom) + 30px)", gap: 16 }}>{children}</main>
  );

  if (step === "start") return wrap(
    <>
      {inv ? (
        <>
        <div style={{ marginTop: 30, display: "flex", justifyContent: "center" }}><FrejasLockup mark={64} word={22} /></div>
        <div className="soft" style={{ marginTop: 10, padding: 20, borderRadius: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          <Avatars people={inv.member_names.map((n) => ({ name: n }))} size={44} ring="var(--soft)" />
          <div className="muted" style={{ fontSize: 14 }}><b style={{ color: "var(--ink)" }}>{inv.member_names[0]}</b> invited you to</div>
          <div className="h1">{inv.name}</div>
          {inv.stake && <span className="tag tag-accent" style={{ display: "flex", gap: 4, alignItems: "center" }}><StakeIcon stake={inv.stake} size={14} />{stakeText(inv.stake)}</span>}
          <div className="muted" style={{ fontSize: 14.5, marginTop: 6 }}>Create a free account to join. It takes less than a minute.</div>
        </div>
        </>
      ) : (
        <div style={{ marginTop: 70, display: "flex", flexDirection: "column", alignItems: "center", gap: 26, textAlign: "center" }}>
          <FrejasLockup mark={112} word={34} />
          <h1 className="h1" style={{ fontSize: 36 }}>Small habits,<br />better together.</h1>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 280, margin: 0 }}>Keep your own routines and start friendly challenges with friends.</p>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <button className="btn btn-primary" onClick={() => setStep("email")}><Icon name="mail" />Continue with email</button>
      <p className="muted" style={{ textAlign: "center", fontSize: "var(--t-sub)", lineHeight: 1.5, margin: 0 }}>
        By continuing you agree to the <a href="/terms" style={{ color: "var(--ink)" }}>Terms</a> and <a href="/privacy" style={{ color: "var(--ink)" }}>Privacy Policy</a>.
      </p>
    </>,
  );

  if (step === "email") return wrap(
    <>
      <button className="icon-btn" aria-label="Back" onClick={() => setStep("start")}><Icon name="left" /></button>
      <h1 className="h1" style={{ fontSize: 30, marginTop: 12, textAlign: "center" }}>What's your email?</h1>
      <p className="muted" style={{ fontSize: 15, lineHeight: 1.5, margin: 0, textAlign: "center" }}>We'll send you a 6-digit code. No password to remember.</p>
      <form noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!/.+@.+\..+/.test(email.trim())) { setErr(email.trim() ? "That doesn't look like an email address. Check it and try again." : "Type your email address first."); emailRef.current?.focus(); return; }
        if (isReview && !password) { setErr("Type the password too."); return; }
        sendCode();
      }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label className="field"><Icon name="mail" color="var(--ink-2)" />
          <input ref={emailRef} type="email" required autoFocus autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} aria-label="Email" />
        </label>
        {isReview && (
          <label className="field"><Icon name="lock" color="var(--ink-2)" />
            <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
          </label>
        )}
        {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700, textAlign: "center" }}>{err}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? (isReview ? "Signing in…" : "Sending…") : isReview ? "Sign in" : "Send code"}</button>
      </form>
      <p className="muted" style={{ textAlign: "center", fontSize: "var(--t-sub)", margin: 0 }}>New here? The same code creates your account.</p>
    </>,
  );

  if (step === "code") return wrap(
    <>
      <button className="icon-btn" aria-label="Back" onClick={() => setStep("email")}><Icon name="left" /></button>
      <h1 className="h1" style={{ fontSize: 30, marginTop: 12, textAlign: "center" }}>Check your inbox</h1>
      <p className="muted" style={{ fontSize: 15, lineHeight: 1.5, margin: 0, textAlign: "center" }}>We sent an email to <b style={{ color: "var(--ink)" }}>{email}</b>. {isNative() ? "Enter the 6-digit code from it." : "Tap the link in it, or enter the 6-digit code."}</p>
      <label className="field" style={{ justifyContent: "center" }}>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code" value={code}
          className="font-display" style={{ fontSize: 30, letterSpacing: 14, textAlign: "center" }} placeholder="······"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) verify(v);
          }} />
      </label>
      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700, textAlign: "center" }}>{err}</div>}
      <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>{busy ? "Checking…" : "Signs you in as soon as all six digits are in."}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        {resendIn > 0 ? <span className="muted">Resend code in 0:{String(resendIn).padStart(2, "0")}</span>
          : <button onClick={sendCode} style={{ border: 0, background: "none", fontWeight: 800, color: "var(--primary)", padding: 0 }}>Send a new code</button>}
        <button onClick={() => setStep("email")} style={{ border: 0, background: "none", fontWeight: 800, color: "var(--primary)", padding: 0 }}>Change email</button>
      </div>
    </>,
  );

  return wrap(
    <>
      <h1 className="h1" style={{ fontSize: 30, marginTop: 30, textAlign: "center" }}>What should friends call you?</h1>
      <p className="muted" style={{ fontSize: 15, lineHeight: 1.5, margin: 0, textAlign: "center" }}>Shown in challenges and the feed. You can change it later.</p>
      <button onClick={() => fileRef.current?.click()} style={{ alignSelf: "center", border: 0, background: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, margin: "10px 0" }}>
        <span style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {photo ? <img src={URL.createObjectURL(photo)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="camera" size={32} stroke={1.7} />}
        </span>
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Add photo (optional)</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      <label className="field"><input ref={nameRef} autoFocus maxLength={40} placeholder="Your name" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} aria-label="Your name" style={{ textAlign: "center" }} /></label>
      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700, textAlign: "center" }}>{err}</div>}
      <div style={{ flex: 1 }} />
      <button className="btn btn-primary" disabled={busy} onClick={() => { if (!name.trim()) { setErr("Type your name first."); nameRef.current?.focus(); return; } saveName(); }}>{busy ? "Saving…" : "Get started"}</button>
    </>,
  );
}

export default function Page() {
  return <Suspense><Welcome /></Suspense>;
}
