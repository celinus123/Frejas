"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { useApp } from "./AppProvider";
import { answerQuestion, nextQuestion, type Question } from "@/lib/usage";

const later = (id: string) => `frejas-q-later:${id}`;
const DAY = 20 * 60 * 60 * 1000;   // "Not now" keeps a question away until roughly the next day

let askedThisOpen = false;   // once per time the app is opened, however many pages are visited

/** A question from whoever runs Frejas to everyone. Shows at most one, at most once each time the app is opened,
 *  and never on top of something else that is open. */
export function AskEveryone() {
  const { userId, profile, toast } = useApp();
  const [q, setQ] = useState<Question | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const named = !!profile?.display_name;

  useEffect(() => {
    if (!userId || !named || askedThisOpen) return;
    askedThisOpen = true;
    let off = false;
    const t = setTimeout(async () => {
      const next = await nextQuestion();
      if (off || !next) return;
      try { if (Date.now() - Number(localStorage.getItem(later(next.id)) ?? 0) < DAY) return; } catch { /* no storage */ }
      if (document.querySelector(".sheet")) return;   // something else is open: ask next time instead
      setQ(next);
    }, 2500);
    return () => { off = true; clearTimeout(t); };
  }, [userId, named]);

  if (!q || !userId) return null;
  const close = () => { setQ(null); setChoice(null); setBody(""); setErr(null); setBusy(false); };
  function notNow() { try { localStorage.setItem(later(q!.id), String(Date.now())); } catch { /* no storage */ } close(); }
  async function send(skipped = false) {
    if (busy) return;
    if (!skipped && q!.kind !== "text" && !choice) { setErr(q!.kind === "scale" ? "Pick a number first." : "Pick an answer first."); return; }
    if (!skipped && q!.kind === "text" && !body.trim()) { setErr("Write something first."); return; }
    setBusy(true); setErr(null);
    try {
      await answerQuestion(userId!, q!, skipped ? { skipped: true } : q!.kind === "text" ? { body } : { choice: choice! });
      close();
      if (!skipped) toast({ text: <><b>Thank you.</b> That helps a lot.</> });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <Sheet open onClose={notNow} label="A question from Frejas">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div className="label" style={{ margin: 0 }}>A question from Frejas</div>
        <button className="icon-btn" aria-label="Not now" onClick={notNow}><Icon name="x" /></button>
      </div>
      <div className="h1" style={{ fontSize: 24 }}>{q.body}</div>

      {q.kind === "choice" && (
        <div role="radiogroup" aria-label={q.body} className="card group">
          {(q.options ?? []).map((o) => (
            <button key={o} role="radio" aria-checked={choice === o} className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left", minHeight: 50 }} onClick={() => { setChoice(o); setErr(null); }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{choice === o && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)" }} />}</span>
              <span style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>{o}</span>
            </button>
          ))}
        </div>
      )}
      {q.kind === "scale" && (
        <div>
          <div role="radiogroup" aria-label={q.body} style={{ display: "flex", gap: 8 }}>
            {["1", "2", "3", "4", "5"].map((n) => (
              <button key={n} role="radio" aria-checked={choice === n} onClick={() => { setChoice(n); setErr(null); }}
                style={{ flex: 1, height: 52, borderRadius: 16, border: 0, fontSize: 18, fontWeight: 800, background: choice === n ? "var(--primary)" : "var(--soft)", color: choice === n ? "var(--on-primary)" : "var(--ink)" }}>{n}</button>
            ))}
          </div>
          <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-sub)", padding: "6px 2px 0" }}><span>Not at all</span><span>Very much</span></div>
        </div>
      )}
      {q.kind === "text" && (
        <label className="field" style={{ alignItems: "flex-start", padding: "12px 16px" }}>
          <textarea value={body} onChange={(e) => { setBody(e.target.value.slice(0, 500)); setErr(null); }} rows={4} maxLength={500} placeholder="Your answer" aria-label="Your answer" style={{ resize: "none", fontWeight: 600, fontFamily: "inherit", color: "inherit" }} />
        </label>
      )}

      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
      <button className="btn btn-primary" disabled={busy} onClick={() => send()}>{busy ? "Sending…" : "Send"}</button>
      <button className="btn btn-soft" disabled={busy} onClick={notNow}>Not now</button>
      <button disabled={busy} onClick={() => send(true)} style={{ border: 0, background: "none", color: "var(--ink-2)", fontSize: "var(--t-sub)", fontWeight: 700, padding: 4, textDecoration: "underline", textUnderlineOffset: 3 }}>Don&apos;t ask me this one</button>
    </Sheet>
  );
}
