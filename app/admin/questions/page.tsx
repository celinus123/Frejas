"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { BackBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/dates";

type Kind = "choice" | "scale" | "text";
interface Q {
  id: string; body: string; kind: Kind; options: string[] | null; after_days: number; created_at: string; closed_at: string | null;
  answered: number; skipped: number; counts: Record<string, number>; texts: { body: string; at: string }[];
}
const KINDS: [Kind, string, string][] = [["choice", "Pick one", "They choose one of your answers"], ["scale", "1 to 5", "From 'not at all' to 'very much'"], ["text", "Write freely", "They type their own answer"]];
const WHO: [number, string][] = [[0, "Everyone"], [3, "Here 3 days or more"], [7, "Here a week or more"], [14, "Here two weeks or more"]];

/** Ask everyone a question, and read the answers. Only for whoever looks after Frejas. */
export default function Questions() {
  const { userId, toast } = useApp();
  const [rows, setRows] = useState<Q[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Kind>("choice");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [after, setAfter] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase().rpc("admin_questions");
    if (error || !data) { setDenied(true); return; }
    setRows(data as Q[]);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const opts = options.map((o) => o.trim()).filter(Boolean);
  function check(): string | null {
    if (body.trim().length < 3) return "Write the question first.";
    if (kind === "choice" && opts.length < 2) return "Give at least two answers to choose from.";
    if (kind === "choice" && new Set(opts).size !== opts.length) return "Two of the answers are the same.";
    return null;
  }
  async function ask() {
    const problem = check();
    if (problem) { setErr(problem); setSure(false); return; }
    if (!sure) { setSure(true); setErr(null); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase().rpc("admin_ask", { p_body: body.trim(), p_kind: kind, p_options: kind === "choice" ? opts : null, p_after_days: after });
    setBusy(false); setSure(false);
    if (error) { setErr(error.message); return; }
    setBody(""); setOptions(["", ""]);
    toast({ text: <><b>Asked.</b> People see it the next time they open Frejas.</> });
    load();
  }
  async function close(q: Q) {
    const { error } = await supabase().rpc("admin_close_question", { p_id: q.id });
    if (error) { toast({ text: error.message }); return; }
    toast({ text: "Closed. Nobody is asked this any more." });
    load();
  }

  if (denied) return (
    <main className="page"><BackBar />
      <div className="card" style={{ padding: 24, textAlign: "center" }}><div className="h1" style={{ fontSize: 22 }}>Page not found</div></div>
    </main>
  );
  const open = rows?.filter((q) => !q.closed_at) ?? [];

  return (
    <main className="page" style={{ gap: 12, paddingBottom: 60 }}>
      <BackBar title="Questions to everyone" />

      <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="h2">Ask a question</h2>
        <label className="field" style={{ alignItems: "flex-start", padding: "12px 16px" }}>
          <textarea value={body} onChange={(e) => { setBody(e.target.value.slice(0, 200)); setErr(null); setSure(false); }} rows={2} maxLength={200} placeholder="What would you miss most if Frejas was gone?" aria-label="The question" style={{ resize: "none", fontWeight: 600, fontFamily: "inherit", color: "inherit" }} />
        </label>
        <div role="group" aria-label="How they answer" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {KINDS.map(([k, l]) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); setSure(false); }}>{l}</button>)}
        </div>
        <div className="muted" style={{ fontSize: "var(--t-sub)", marginTop: -4 }}>{KINDS.find(([k]) => k === kind)![2]}</div>
        {kind === "choice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {options.map((o, i) => (
              <label key={i} className="field" style={{ minHeight: 46 }}>
                <input value={o} maxLength={80} placeholder={`Answer ${i + 1}`} aria-label={`Answer ${i + 1}`} onChange={(e) => { setOptions(options.map((x, j) => (j === i ? e.target.value : x))); setErr(null); setSure(false); }} />
                {options.length > 2 && <button type="button" aria-label={`Remove answer ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))} style={{ border: 0, background: "none", padding: 4, color: "var(--ink-2)" }}><Icon name="x" size={16} /></button>}
              </label>
            ))}
            {options.length < 6 && <button className="btn btn-soft btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setOptions([...options, ""])}><Icon name="plus" size={16} />Another answer</button>}
          </div>
        )}
        <div className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Who is asked</div>
        <div role="group" aria-label="Who is asked" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {WHO.map(([d, l]) => <button key={d} className="chip" aria-pressed={after === d} onClick={() => { setAfter(d); setSure(false); }}>{l}</button>)}
        </div>
        {open.length > 0 && <div className="muted" style={{ fontSize: "var(--t-sub)", lineHeight: 1.45 }}>{open.length === 1 ? "One question is" : `${open.length} questions are`} already open. People get one at a time, the oldest first, so this one waits its turn for anyone who hasn&apos;t answered.</div>}
        {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
        {sure && <div className="soft" style={{ padding: "10px 14px", borderRadius: 16, fontSize: 14, lineHeight: 1.45 }}>This pops up for {after ? WHO.find(([d]) => d === after)![1].toLowerCase().replace("here", "everyone who has been here") : "everyone"} the next time they open Frejas. It can be closed, but not changed.</div>}
        <button className="btn btn-primary" disabled={busy} onClick={ask}><Icon name="send" />{busy ? "Asking…" : sure ? "Yes, ask everyone" : "Ask everyone"}</button>
      </section>

      {rows === null && <div className="skeleton" style={{ height: 180 }} />}
      {rows?.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "14px 4px", textAlign: "center" }}>No questions yet. The answers show up here.</div>}
      {rows?.map((q) => {
        const names = q.kind === "choice" ? (q.options ?? []) : q.kind === "scale" ? ["1", "2", "3", "4", "5"] : [];
        const max = Math.max(1, ...names.map((n) => q.counts[n] ?? 0));
        const sum = names.reduce((a, n) => a + (q.counts[n] ?? 0) * Number(n), 0);
        return (
          <article key={q.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className={q.closed_at ? "tag" : "tag tag-accent"} style={{ fontWeight: 800 }}>{q.closed_at ? "Closed" : "Open"}</span>
              <span className="t-sub" style={{ fontWeight: 700 }}>{KINDS.find(([k]) => k === q.kind)![1]}{q.after_days ? ` · here ${q.after_days}+ days` : ""}</span>
              <span className="t-meta muted" style={{ marginLeft: "auto" }}>{timeAgo(q.created_at)}</span>
            </div>
            <div className="h1" style={{ fontSize: 20 }}>{q.body}</div>
            <div className="t-sub" style={{ fontWeight: 700 }}>{q.answered} {q.answered === 1 ? "answer" : "answers"}{q.skipped ? ` · ${q.skipped} chose not to answer` : ""}{q.kind === "scale" && q.answered ? ` · average ${(sum / q.answered).toFixed(1)}` : ""}</div>
            {names.length > 0 && (
              <div role="table" aria-label="Answers" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {names.map((n) => {
                  const c = q.counts[n] ?? 0;
                  return (
                    <div role="row" key={n} style={{ display: "grid", gridTemplateColumns: q.kind === "scale" ? "24px 1fr 70px" : "minmax(0, 40%) 1fr 70px", alignItems: "center", gap: 10 }}>
                      <span role="cell" style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
                      <span aria-hidden="true" style={{ height: 12, borderRadius: 6, background: "var(--soft-l)" }}><span style={{ display: "block", height: "100%", width: `${(c / max) * 100}%`, minWidth: c ? 4 : 0, borderRadius: 6, background: "var(--accent)" }} /></span>
                      <span role="cell" style={{ fontSize: 13, fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c}<span className="muted" style={{ fontWeight: 600 }}> · {q.answered ? Math.round((c / q.answered) * 100) : 0}%</span></span>
                    </div>
                  );
                })}
              </div>
            )}
            {q.kind === "text" && q.texts.map((t, i) => (
              <div key={i} className="soft" style={{ padding: "10px 14px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.45, wordBreak: "break-word" }}>{t.body}<div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{timeAgo(t.at)}</div></div>
            ))}
            {!q.closed_at && <button className="btn btn-soft" onClick={() => close(q)}>Close the question</button>}
          </article>
        );
      })}
    </main>
  );
}
