"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { Avatar } from "./ui";

const badge = { position: "absolute", minWidth: 22, height: 22, padding: "0 5px", borderRadius: 11, background: "var(--cta)", color: "var(--on-cta)", border: "2px solid var(--bg)", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", textDecoration: "none" } as const;

/** The top of a main page: the heading, and your profile picture in the right corner (always the way to your profile). */
export function PageHead({ title, pad }: { title: ReactNode; pad?: number }) {
  const { profile, reportsOpen, unread } = useApp();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: pad ? `0 ${pad}px` : undefined }}>
      <h1 className="h1" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h1>
      {profile && (
        <div style={{ flexShrink: 0, position: "relative" }}>
          <Link href="/profile" aria-label="Profile" style={{ display: "block" }}><Avatar name={profile.display_name} path={profile.avatar_path} size={44} /></Link>
          {/* how many notifications haven't been read; a tap opens the list */}
          {unread > 0 && <Link href="/notifications" aria-label={`${unread} new ${unread === 1 ? "notification" : "notifications"}. Open`} style={{ ...badge, top: -5, right: -5 }}>{unread > 9 ? "9+" : unread}</Link>}
          {/* only for whoever looks after reports: how many are waiting */}
          {!!reportsOpen && <Link href="/admin/reports" aria-label={`${reportsOpen} ${reportsOpen === 1 ? "report is" : "reports are"} waiting. Open`} style={{ ...badge, bottom: -5, right: -5, background: "var(--primary)", color: "var(--on-primary)" }}>{reportsOpen}</Link>}
        </div>
      )}
    </div>
  );
}
