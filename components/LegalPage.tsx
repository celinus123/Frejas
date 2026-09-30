import type { ReactNode } from "react";
import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="page" style={{ gap: 12, paddingBottom: 60, lineHeight: 1.55, fontSize: 15 }}>
      <Link href="/" className="muted" style={{ fontSize: 14, fontWeight: 700, textDecoration: "none" }}>← Orbit</Link>
      <h1 className="h1">{title}</h1>
      <div className="muted" style={{ fontSize: 13 }}>Last updated {updated}</div>
      {children}
    </main>
  );
}
