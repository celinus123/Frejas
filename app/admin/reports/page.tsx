"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { BackBar } from "@/components/ui";
import { REASONS, whatOf, type ReportKind } from "@/lib/safety";
import { timeAgo } from "@/lib/dates";

interface Row {
  id: string; kind: ReportKind; reason: string; details: string | null; snapshot: string | null; day: string | null; created_at: string;
  handled_at: string | null; handled_action: "kept" | "removed" | "account_removed" | null; exists: boolean | null; photo: string | null;
  target: { id: string; name: string; reports: number } | null; reporter: { id: string; name: string } | null; challenge: string | null;
}
const reasonLabel = (r: string) => REASONS.find(([id]) => id === r)?.[1] ?? r;
const kindLabel = (k: ReportKind) => (k === "person" ? "A person" : k === "day_card" ? "Habits for a day" : k === "check_in" ? "A post" : k === "message" ? "A chat message" : "A comment");
const OUTCOME = { kept: "Kept", removed: "Removed", account_removed: "Account removed" } as const;

/** Reports from people using Frejas. Only for whoever looks after it; everyone else gets "not found". */
export default function Reports() {
  const { session, toast, refreshReports } = useApp();
  const [tab, setTab] = useState<"open" | "handled">("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);   // the report whose "remove the account" is being confirmed
  const token = session?.access_token;

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/admin/reports?status=${tab}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) { setDenied(true); return; }
    setRows(((await res.json()) as { reports: Row[] }).reports);
  }, [token, tab]);
  useEffect(() => { setRows(null); load().catch(() => setDenied(true)); }, [load]);

  async function act(r: Row, action: "keep" | "remove" | "remove_account") {
    if (!token || busy) return;
    setBusy(r.id);
    const res = await fetch("/api/admin/reports", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, action }) });
    setBusy(null); setConfirm(null);
    if (!res.ok) { toast({ text: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work. Try again." }); return; }
    toast({ text: action === "keep" ? "Kept. The report is closed." : action === "remove" ? "Removed." : <><b>{r.target?.name ?? "The account"}</b> and everything they posted is removed.</> });
    await load(); refreshReports();
  }

  if (denied) return (
    <main className="page"><BackBar />
      <div className="card" style={{ padding: 24, textAlign: "center" }}><div className="h1" style={{ fontSize: 22 }}>Page not found</div></div>
    </main>
  );

  return (
    <main className="page" style={{ gap: 12 }}>
      <BackBar title="Reports" />
      <div role="group" aria-label="Show" style={{ display: "flex", gap: 8 }}>
        <button className="chip" aria-pressed={tab === "open"} onClick={() => setTab("open")}>Waiting{tab === "open" && rows ? ` · ${rows.length}` : ""}</button>
        <button className="chip" aria-pressed={tab === "handled"} onClick={() => setTab("handled")}>Handled</button>
      </div>
      {rows === null && <div className="skeleton" style={{ height: 220 }} />}
      {rows?.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "18px 4px", textAlign: "center" }}>{tab === "open" ? "Nothing is waiting. Reports show up here, and you get a dot on your profile picture." : "Nothing has been handled yet."}</div>}
      {rows?.map((r) => {
        const what = whatOf(r.kind);
        const first = r.target?.name.split(" ")[0] ?? "the person";
        return (
          <article key={r.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="tag tag-accent" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800 }}><Icon name="flag" size={13} stroke={2.1} />{reasonLabel(r.reason)}</span>
              <span className="t-sub" style={{ fontWeight: 700 }}>{kindLabel(r.kind)}{r.day ? ` · ${r.day}` : ""}</span>
              <span className="t-meta muted" style={{ marginLeft: "auto" }}>{timeAgo(r.created_at)}</span>
            </div>
            {r.photo && <img src={r.photo} alt="The reported photo" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 16 }} />}
            {r.snapshot && <div className="soft" style={{ padding: "10px 14px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.45, wordBreak: "break-word" }}>{r.snapshot.replace(/ · photo: .*$/, "")}</div>}
            <div className="t-sub" style={{ lineHeight: 1.5 }}>
              {r.kind === "person" ? "About" : "Posted by"} <b style={{ color: "var(--ink)" }}>{r.target?.name ?? "an account that is gone"}</b>{r.challenge ? <> in <b style={{ color: "var(--ink)" }}>{r.challenge}</b></> : null}
              {r.target && r.target.reports > 1 ? ` · ${r.target.reports} reports about ${first} in all` : ""}<br />
              Reported by {r.reporter?.name ?? "an account that is gone"}{r.details ? <>: <span style={{ color: "var(--ink)" }}>“{r.details}”</span></> : ""}
            </div>
            {tab === "handled" ? (
              <div className="t-sub" style={{ fontWeight: 800 }}>{r.handled_action ? OUTCOME[r.handled_action] : "Handled"}{r.handled_at ? ` · ${timeAgo(r.handled_at)}` : ""}</div>
            ) : confirm === r.id ? (
              <div className="soft" style={{ padding: 14, borderRadius: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 14, lineHeight: 1.45 }}><b>Remove {r.target?.name}&apos;s account?</b> Their habits, check-ins, photos and comments are deleted. Challenges they made are handed to another member. This can&apos;t be undone.</div>
                <button className="btn" style={{ background: "var(--ink)", color: "var(--bg)" }} disabled={busy === r.id} onClick={() => act(r, "remove_account")}>{busy === r.id ? "Removing…" : "Yes, remove the account"}</button>
                <button className="btn btn-white" onClick={() => setConfirm(null)}>No, go back</button>
              </div>
            ) : (
              <>
                {r.exists === false && <div className="t-sub" style={{ fontWeight: 700 }}>The {what} is already gone.</div>}
                {what && r.exists && <button className="btn btn-primary" disabled={busy === r.id} onClick={() => act(r, "remove")}>{busy === r.id ? "Removing…" : `Remove the ${what}`}</button>}
                <button className="btn btn-soft" disabled={busy === r.id} onClick={() => act(r, "keep")}>{what && r.exists ? "Keep it" : "Close the report"}</button>
                {r.target && <button className="btn" style={{ background: "none", color: "var(--ink-2)", height: 36 }} onClick={() => setConfirm(r.id)}>Remove {first}&apos;s account…</button>}
              </>
            )}
          </article>
        );
      })}
    </main>
  );
}
