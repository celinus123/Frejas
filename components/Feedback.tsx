"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { useApp } from "./AppProvider";
import { sendFeedback } from "@/lib/usage";

/** "Give feedback": a few lines straight to whoever runs Frejas. */
export function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId, toast } = useApp();
  const path = usePathname();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setErr(null); setBusy(false); } }, [open]);

  async function send() {
    if (!userId || busy) return;
    if (!body.trim()) { setErr("Write a few words first."); return; }
    setBusy(true); setErr(null);
    try {
      await sendFeedback(userId, body, path);
      setBody(""); onClose();
      toast({ text: <><b>Thank you.</b> We read everything that comes in.</> });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Give feedback">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div className="h1" style={{ fontSize: 22 }}>Give feedback</div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>What is confusing, missing or annoying? What do you like? A few words are enough.</p>
      <label className="field" style={{ alignItems: "flex-start", padding: "12px 16px" }}>
        <textarea value={body} onChange={(e) => { setBody(e.target.value.slice(0, 1000)); setErr(null); }} rows={5} maxLength={1000} placeholder="Tell us what you think" aria-label="Your feedback" style={{ resize: "none", fontWeight: 600, fontFamily: "inherit", color: "inherit" }} />
      </label>
      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
      <button className="btn btn-primary" disabled={busy} onClick={send}><Icon name="send" />{busy ? "Sending…" : "Send"}</button>
      <p className="muted" style={{ margin: 0, fontSize: "var(--t-sub)", lineHeight: 1.45, textAlign: "center" }}>Sent with your name, so we can ask you more if we need to.</p>
    </Sheet>
  );
}
