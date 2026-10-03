"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { useApp } from "./AppProvider";
import { supabase } from "@/lib/supabase";
import { forgetPush } from "@/lib/push";
import { captchaToken, isCaptchaError, CAPTCHA_FAILED } from "@/lib/captcha";
import { track } from "@/lib/analytics";

/** For someone using Frejas without an account: add an email, confirm it with the code we send, and the same
 *  habits, challenges and friends now belong to an account that can be opened from any phone. */
export function SaveAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useApp();
  const [step, setStep] = useState<"email" | "code" | "taken">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => { if (open) { setStep("email"); setCode(""); setErr(null); setBusy(false); done.current = false; } }, [open]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function finish() {
    if (done.current) return;
    done.current = true;
    track("account_saved");
    onClose();
    toast({ text: <><b>Your account is saved.</b> Log in with {email.trim()} on any phone.</> });
  }

  // The email also carries a link. If it was tapped instead of typing the code, the account is already saved:
  // notice that while this sheet is waiting for the code.
  useEffect(() => {
    if (!open || step !== "code") return;
    const check = async () => {
      if (done.current || document.visibilityState !== "visible") return;
      const { data } = await supabase().auth.getUser();
      if (data.user && !data.user.is_anonymous && data.user.email) { await supabase().auth.refreshSession(); finish(); }
    };
    const id = setInterval(check, 5000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  async function send() {
    const to = email.trim();
    if (!/.+@.+\..+/.test(to)) { setErr(to ? "That doesn't look like an email address. Check it and try again." : "Type your email address first."); emailRef.current?.focus(); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.updateUser({ email: to }, { emailRedirectTo: `${window.location.origin}/settings` });
    setBusy(false);
    if (error) {
      if (error.code === "email_exists" || /already (been )?registered|already exists/i.test(error.message)) return setStep("taken");
      const limited = error.status === 429 || /rate limit|only request this after/i.test(error.message);
      return setErr(isCaptchaError(error) ? CAPTCHA_FAILED : limited ? "Too many emails in a short time. Wait a little and try again." : error.message);
    }
    setStep("code"); setCode(""); setResendIn(45);
  }

  async function verify(value: string) {
    setBusy(true); setErr(null);
    let { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: value, type: "email_change" });
    if (isCaptchaError(error)) ({ error } = await supabase().auth.verifyOtp({ email: email.trim(), token: value, type: "email_change", options: { captchaToken: await captchaToken() } }));
    setBusy(false);
    if (error) { setErr("That code didn't work. Check it, or send a new one."); setCode(""); return; }
    finish();
  }

  // the email already has an account: logging in to it leaves the guest's things behind
  async function logInInstead() {
    setBusy(true);
    await forgetPush();
    await supabase().auth.signOut();
    router.replace("/welcome");
  }

  const head = (title: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div className="h1" style={{ fontSize: 22 }}>{title}</div>
      <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
    </div>
  );
  const link = { border: 0, background: "none", fontWeight: 800, color: "var(--primary)", padding: 0, textDecoration: "underline", textUnderlineOffset: 3 } as const;

  return (
    <Sheet open={open} onClose={onClose} label="Save my account">
      {step === "email" && (
        <>
          {head("Save my account")}
          <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>Add your email and everything you have here stays yours, on a new phone too, or if this one is lost. We send a 6-digit code to confirm it. No password to remember.</p>
          <form noValidate onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="field"><Icon name="mail" color="var(--ink-2)" />
              <input ref={emailRef} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} aria-label="Email" />
            </label>
            {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
            <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </form>
        </>
      )}

      {step === "code" && (
        <>
          {head("Check your inbox")}
          <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>We sent an email to <b style={{ color: "var(--ink)" }}>{email.trim()}</b>. Enter the 6-digit code from it.</p>
          <label className="field" style={{ justifyContent: "center" }}>
            <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code" value={code}
              className="font-display" style={{ fontSize: 30, letterSpacing: 14, textAlign: "center" }} placeholder="······"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) verify(v); }} />
          </label>
          {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700, textAlign: "center" }}>{err}</div>}
          <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>{busy ? "Checking…" : "Saves your account as soon as all six digits are in."}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            {resendIn > 0 ? <span className="muted">Resend code in 0:{String(resendIn).padStart(2, "0")}</span> : <button onClick={send} style={link}>Send a new code</button>}
            <button onClick={() => { setStep("email"); setErr(null); }} style={link}>Change email</button>
          </div>
        </>
      )}

      {step === "taken" && (
        <>
          {head("That email has an account")}
          <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>There is already a Frejas account for <b style={{ color: "var(--ink)" }}>{email.trim()}</b>. You can log in to it, but what you have made here without an account doesn&apos;t move over, and can&apos;t be opened again afterwards.</p>
          <button className="btn btn-primary" onClick={() => { setStep("email"); setEmail(""); }}>Use another email</button>
          <button className="btn btn-soft" disabled={busy} onClick={logInInstead}>{busy ? "Leaving…" : "Leave this and log in instead"}</button>
        </>
      )}
    </Sheet>
  );
}

/** The card that tells a guest what is at stake, with the way to fix it. */
export function GuestCard({ onSave }: { onSave: () => void }) {
  return (
    <section className="soft" style={{ padding: 16, borderRadius: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ marginTop: 2 }}><Icon name="shield" color="var(--primary)" /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>You&apos;re using Frejas without an account</div>
          <div className="muted" style={{ fontSize: "var(--t-sub)", lineHeight: 1.45, marginTop: 2 }}>Your habits and challenges can only be opened from this device. Add your email to keep them if you change or lose it.</div>
        </div>
      </div>
      <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={onSave}>Save my account</button>
    </section>
  );
}
