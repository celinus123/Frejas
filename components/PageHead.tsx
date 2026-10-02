"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { Avatar } from "./ui";

/** The top of a main page: the heading, and your profile picture in the right corner (always the way to your profile). */
export function PageHead({ title, pad }: { title: ReactNode; pad?: number }) {
  const { profile } = useApp();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: pad ? `0 ${pad}px` : undefined }}>
      <h1 className="h1" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h1>
      {profile && <Link href="/profile" aria-label="Profile" style={{ flexShrink: 0 }}><Avatar name={profile.display_name} path={profile.avatar_path} size={44} /></Link>}
    </div>
  );
}
