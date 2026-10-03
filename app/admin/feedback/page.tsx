"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { BackBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/dates";

interface Row { id: string; body: string; page: string | null; build: string | null; platform: string | null; created_at: string; handled_at: string | null; name: string | null; level: string | null }
const WHERE: Record<string, string> = { ios: "iPhone app", android: "Android app", home: "home screen", web: "browser" };
const LEVEL: Record<string, string> = { guest: "no account", free: "free", plus: "paid level" };

/** What people wrote under "Give feedback". Only for whoever looks after Frejas. */
export default function FeedbackInbox() {
  const { userId, toast } = useApp();
  const [tab, setTab] = useState<"new" | "done">("new");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase().rpc("admin_feedback", { p_handled: tab === "done" });
    if (error || !data) { setDenied(true); return; }
    setRows(data as Row[]);
  }, [userId, tab]);
  useEffect(() => { setRows(null); load(); }, [load]);

  async function mark(r: Row, done: boolean) {
    const { error } = await supabase().rpc("admin_feedback_done", { p_id: r.id, p_done: done });
    if (error) { toast({ text: error.message }); return; }
    setRows((all) => all?.filter((x) => x.id !== r.id) ?? null);
  }

  if (denied) return (
    <main className="page"><BackBar />
      <div className="card" style={{ padding: 24, textAlign: "center" }}><div className="h1" style={{ fontSize: 22 }}>Page not found</div></div>
    </main>
  );
  return (
    <main className="page" style={{ gap: 12, paddingBottom: 60 }}>
      <BackBar title="Feedback" />
      <div role="group" aria-label="Show" style={{ display: "flex", gap: 8 }}>
        <button className="chip" aria-pressed={tab === "new"} onClick={() => setTab("new")}>New{tab === "new" && rows ? ` · ${rows.length}` : ""}</button>
        <button className="chip" aria-pressed={tab === "done"} onClick={() => setTab("done")}>Done</button>
      </div>
      {rows === null && <div className="skeleton" style={{ height: 180 }} />}
      {rows?.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "18px 4px", textAlign: "center" }}>{tab === "new" ? "Nothing new. What people write under Give feedback shows up here." : "Nothing here yet."}</div>}
      {rows?.map((r) => (
        <article key={r.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.body}</div>
          <div className="t-sub" style={{ lineHeight: 1.5 }}>
            <b style={{ color: "var(--ink)" }}>{r.name || "Someone whose account is gone"}</b>{r.level ? ` · ${LEVEL[r.level] ?? r.level}` : ""}{r.platform ? ` · ${WHERE[r.platform] ?? r.platform}` : ""}{r.build ? ` · version ${r.build}` : ""} · {timeAgo(r.created_at)}
          </div>
          <button className="btn btn-soft" onClick={() => mark(r, tab === "new")}>{tab === "new" ? "Mark as done" : "Move back to New"}</button>
        </article>
      ))}
    </main>
  );
}
