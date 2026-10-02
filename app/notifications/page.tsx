"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { BackBar, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/dates";

interface Row { id: string; kind: "invite" | "request" | "comment" | "friend"; title: string; body: string; url: string; read_at: string | null; created_at: string }
const ICON = { invite: "trophy", request: "users", comment: "comment", friend: "user" } as const;

/** Everything you have been told about, newest first. Opening the page marks it all as read. */
export default function Notifications() {
  const { userId, refreshUnread } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase().from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
      const list = (data ?? []) as Row[];
      setRows(list);   // shown with the new ones still marked, so you can see which they were
      if (list.some((r) => !r.read_at)) {
        await supabase().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
        refreshUnread();
      }
    })();
  }, [userId, refreshUnread]);

  return (
    <main className="page" style={{ gap: 10 }}>
      <BackBar title="Notifications" />
      {rows === null && <div className="skeleton" style={{ height: 200 }} />}
      {rows?.length === 0 && (
        <Empty icon="bell" title="Nothing yet" text="Invitations, requests to join your challenges, comments and new friends show up here." />
      )}
      {rows && rows.length > 0 && (
        <section className="card group" style={{ overflow: "hidden" }}>
          {rows.map((r) => (
            <Link key={r.id} href={r.url} className="row" style={{ color: "inherit", textDecoration: "none", alignItems: "flex-start", padding: "12px 16px", background: r.read_at ? undefined : "var(--soft-l)" }}>
              <span style={{ width: 38, height: 38, borderRadius: 14, background: "var(--soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={ICON[r.kind] ?? "bell"} size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--t-title)", fontWeight: r.read_at ? 700 : 800 }}>{r.title}</span>
                {r.body && <span className="muted" style={{ display: "block", fontSize: "var(--t-sub)", wordBreak: "break-word" }}>{r.body}</span>}
                <span className="muted t-meta" style={{ display: "block", marginTop: 2 }}>{timeAgo(r.created_at)}</span>
              </span>
              {!r.read_at && <span aria-label="New" style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--cta)", marginTop: 6, flexShrink: 0 }} />}
            </Link>
          ))}
        </section>
      )}
      <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", lineHeight: 1.45 }}>Your own reminders for habits aren&apos;t listed here. Choose what your phone tells you about in <Link href="/settings" style={{ color: "var(--ink)", fontWeight: 700 }}>Settings</Link>.</div>
    </main>
  );
}
