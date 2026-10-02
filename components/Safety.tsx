"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { useApp } from "./AppProvider";
import { REASONS, blockUser, sendReport, whatOf, type Reason, type SafetyTarget } from "@/lib/safety";

/** The sheet behind "…" on someone else's post, comment, message or name: report it, or block the person. */
export function SafetySheet({ target, onClose, onBlocked }: { target: SafetyTarget | null; onClose: () => void; onBlocked?: () => void }) {
  const { userId, toast } = useApp();
  const [step, setStep] = useState<"menu" | "report" | "block">("menu");
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setStep("menu"); setReason(null); setDetails(""); setErr(null); setBusy(false); }, [target]);
  if (!target || !userId) return null;
  const what = whatOf(target.kind);
  const first = target.name.split(" ")[0] || "this person";

  async function report() {
    if (!reason || busy) return;
    setBusy(true); setErr(null);
    try {
      await sendReport(target!, reason, details, userId!);
      onClose();
      toast({ text: <><b>Thanks, we&apos;ve got it.</b> We look at every report within 24 hours.</> });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function block() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await blockUser(userId!, target!.user);
      onClose();
      toast({ text: <><b>{first} is blocked.</b> Undo it any time in Settings.</> });
      onBlocked?.();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  const head = (title: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div className="h1" style={{ fontSize: 22 }}>{title}</div>
      <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
    </div>
  );
  const rowBtn = { width: "100%", border: 0, background: "none", textAlign: "left" } as const;

  return (
    <Sheet open onClose={onClose} label={step === "block" ? `Block ${first}` : step === "report" ? "Report" : "Report or block"}>
      {step === "menu" && (
        <>
          {head(target.name || "This person")}
          <div className="card group">
            <button className="row" style={rowBtn} onClick={() => setStep("report")}>
              <Icon name="flag" color="var(--primary)" />
              <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{what ? `Report this ${what}` : `Report ${first}`}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>Tell us what&apos;s wrong. {first} isn&apos;t told who reported.</div></div>
              <Icon name="right" size={16} color="var(--ink-2)" />
            </button>
            <button className="row" style={rowBtn} onClick={() => setStep("block")}>
              <Icon name="block" color="var(--primary)" />
              <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Block {first}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>You stop seeing each other&apos;s posts, comments and messages.</div></div>
              <Icon name="right" size={16} color="var(--ink-2)" />
            </button>
          </div>
        </>
      )}

      {step === "report" && (
        <>
          {head(what ? `Report this ${what}` : `Report ${first}`)}
          <div role="radiogroup" aria-label="What's wrong" className="card group">
            {REASONS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={reason === id} className="row" style={{ ...rowBtn, minHeight: 50 }} onClick={() => setReason(id)}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{reason === id && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)" }} />}</span>
                <span style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>{label}</span>
              </button>
            ))}
          </div>
          <label className="field" style={{ alignItems: "flex-start", padding: "12px 16px" }}>
            <textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 500))} rows={2} maxLength={500} placeholder="Anything we should know? (optional)" aria-label="Anything we should know? (optional)" style={{ resize: "none", fontWeight: 600, fontFamily: "inherit", color: "inherit" }} />
          </label>
          {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
          <button className="btn btn-primary" disabled={!reason || busy} onClick={report}>{busy ? "Sending…" : "Send report"}</button>
          <p className="muted" style={{ margin: 0, fontSize: "var(--t-sub)", lineHeight: 1.45, textAlign: "center" }}>We look at every report within 24 hours and remove what breaks the rules.</p>
        </>
      )}

      {step === "block" && (
        <>
          {head(`Block ${first}?`)}
          <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, fontSize: 14, lineHeight: 1.45 }}>
            {[
              "You stop seeing each other's posts, comments and chat messages.",
              `${first} can't add you as a friend, invite you, or join challenges you make.`,
              "In a challenge you're both in, you both stay and the points still count. Only the name shows on the leaderboard.",
              `${first} isn't told. You can undo it in Settings.`,
            ].map((line) => <div key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><span style={{ marginTop: 2 }}><Icon name="check" size={16} stroke={2.4} color="var(--primary)" /></span><span>{line}</span></div>)}
          </div>
          {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
          <button className="btn btn-primary" disabled={busy} onClick={block}><Icon name="block" />{busy ? "Blocking…" : `Block ${first}`}</button>
          <button className="btn btn-soft" onClick={() => setStep("menu")}>Not now</button>
        </>
      )}
    </Sheet>
  );
}
