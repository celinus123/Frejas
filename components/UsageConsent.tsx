"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { useApp } from "./AppProvider";

const LATER = "frejas-usage-later";
let askedThisOpen = false;

/** Asks once whether Frejas may note which screens and buttons are used. Nothing is sent before a yes. */
export function UsageConsent() {
  const { userId, profile, shareUsage, setShareUsage } = useApp();
  const [open, setOpen] = useState(false);
  const named = !!profile?.display_name;

  useEffect(() => {
    if (!userId || !named || shareUsage !== null || askedThisOpen) return;
    const t = setTimeout(() => {
      try { if (Date.now() - Number(localStorage.getItem(LATER) ?? 0) < 3 * 24 * 60 * 60 * 1000) return; } catch { /* no storage */ }
      if (document.querySelector(".sheet")) return;
      askedThisOpen = true;
      setOpen(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [userId, named, shareUsage]);

  if (!open) return null;
  const later = () => { try { localStorage.setItem(LATER, String(Date.now())); } catch { /* no storage */ } setOpen(false); };
  const answer = (yes: boolean) => { setOpen(false); setShareUsage(yes); };

  return (
    <Sheet open onClose={later} label="Help make Frejas better?">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div className="h1" style={{ fontSize: 24 }}>Help make Frejas better?</div>
        <button className="icon-btn" aria-label="Ask me later" onClick={later}><Icon name="x" /></button>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>If you say yes, Frejas notes which screens you open and which buttons you tap, so we can see what is confusing and fix it.</p>
      <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, fontSize: 14, lineHeight: 1.45 }}>
        {[
          "Never the names of your habits or challenges.",
          "Never your photos, comments or messages.",
          "No recordings of your screen, and nothing is sold or used for ads.",
          "Change your mind any time in Settings.",
        ].map((line) => <div key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><span style={{ marginTop: 2 }}><Icon name="check" size={16} stroke={2.4} color="var(--primary)" /></span><span>{line}</span></div>)}
      </div>
      <button className="btn btn-primary" onClick={() => answer(true)}>Yes, share how I use the app</button>
      <button className="btn btn-soft" onClick={() => answer(false)}>No thanks</button>
      <p className="muted" style={{ margin: 0, fontSize: "var(--t-sub)", lineHeight: 1.45, textAlign: "center" }}>More in the <a href="/privacy" style={{ color: "var(--ink)" }}>Privacy Policy</a>.</p>
    </Sheet>
  );
}
