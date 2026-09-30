"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Nav, Sheet } from "./ui";
import { Icon } from "./Icon";
import { useApp } from "./AppProvider";
import { isActive, myChallenges, type MyChallenge } from "@/lib/data";

function Option({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: 0, textAlign: "left" }}>
      <span style={{ width: 46, height: 46, borderRadius: 16, background: "var(--soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={22} /></span>
      <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 16, fontWeight: 800 }}>{title}</span><span className="muted" style={{ display: "block", fontSize: 13 }}>{sub}</span></span>
      <Icon name="right" size={18} color="var(--ink-2)" />
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { userId } = useApp();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [active, setActive] = useState<MyChallenge[]>([]);

  useEffect(() => {
    if (open && userId) myChallenges(userId).then((r) => setActive(r.filter((x) => isActive(x.challenge)))).catch(() => {});
    if (!open) setPicking(false);
  }, [open, userId]);

  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <>
      {children}
      <Nav onPlus={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} label="Add">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="h1" style={{ fontSize: 24 }}>{picking ? "Check in to…" : "Add"}</div>
          <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="x" /></button>
        </div>
        {!picking ? (
          <>
            <Option icon="check" title="Check in" sub="Log progress in a challenge" onClick={() => active.length === 1 ? go(`/challenges/${active[0].challenge.id}?checkin=1`) : setPicking(true)} />
            <Option icon="sun" title="New habit" sub="Private until you share it" onClick={() => go("/habits/new")} />
            <Option icon="trophy" title="New challenge" sub="Invite friends with a link" onClick={() => go("/challenges/new")} />
          </>
        ) : active.length ? (
          active.map(({ challenge }) => (
            <Option key={challenge.id} icon="trophy" title={challenge.name} sub={challenge.goal_type === "own" ? "Own goals" : "Shared goal"} onClick={() => go(`/challenges/${challenge.id}?checkin=1`)} />
          ))
        ) : (
          <div className="muted" style={{ fontSize: 14, padding: "8px 4px 16px" }}>You're not in an active challenge yet. Tick habits off on Today, or start a challenge.</div>
        )}
      </Sheet>
    </>
  );
}
