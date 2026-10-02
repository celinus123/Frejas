"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Flame, Icon } from "@/components/Icon";
import { Avatar, BackBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { loadHabits, myFriends } from "@/lib/data";
import { addDays, today } from "@/lib/dates";

interface Person { id: string; display_name: string; avatar_path: string | null; shared: number }

export default function Profile() {
  const { userId, profile } = useApp();
  const [habitCount, setHabitCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    if (!userId) return;
    loadHabits(userId).then((h) => setHabitCount(h.length));
    supabase().from("habit_logs").select("log_date").eq("user_id", userId).gte("log_date", addDays(today(), -400)).then(({ data }) => {
      const s = new Set((data ?? []).map((r: { log_date: string }) => r.log_date));
      let n = 0; for (let d = s.has(today()) ? today() : addDays(today(), -1); s.has(d); d = addDays(d, -1)) n++;
      setStreak(n);
    });
    myFriends(userId).then(setPeople).catch(() => {});
  }, [userId]);

  if (!profile) return null;
  const stat = (v: React.ReactNode, l: string) => <div style={{ flex: 1, textAlign: "center" }}><div className="font-display" style={{ fontSize: 22, fontWeight: 600, display: "flex", justifyContent: "center", alignItems: "center", gap: 4 }}>{v}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{l}</div></div>;

  return (
    <main className="page">
      <BackBar right={<Link href="/settings" className="icon-btn" aria-label="Settings"><Icon name="gear" /></Link>} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <Avatar name={profile.display_name} path={profile.avatar_path} size={84} />
        <h1 className="h1" style={{ fontSize: 26 }}>{profile.display_name}</h1>
        <div className="muted" style={{ fontSize: 13 }}>Member since {new Date(profile.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
      </div>
      <section className="card" style={{ display: "flex", padding: "14px 8px" }}>
        {stat(habitCount, "habits")}{stat(<><Flame size={18} />{streak}</>, "day streak")}{stat(people.length, "friends")}
      </section>
      <Link href="/archive" className="card row" style={{ color: "inherit", textDecoration: "none" }}>
        <Icon name="archive" color="var(--primary)" />
        <span style={{ flex: 1, fontSize: "var(--t-title)", fontWeight: 700 }}>Archived habits</span>
        <Icon name="right" size={16} color="var(--ink-2)" />
      </Link>
      <div className="label">Friends</div>
      {people.length ? (
        <section className="card group">
          {people.map((p) => (
            <div key={p.id} className="row"><Avatar name={p.display_name} path={p.avatar_path} size={40} />
              <div style={{ flex: 1 }}><div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{p.display_name}</div><div className="muted" style={{ fontSize: "var(--t-sub)" }}>{p.shared ? `${p.shared} challenge${p.shared > 1 ? "s" : ""} together` : "Friend"}</div></div></div>
          ))}
        </section>
      ) : <div className="muted" style={{ fontSize: 14, padding: "0 4px" }}>Add friends from the Feed with your friend link, or start a challenge together.</div>}
      <Link href="/challenges/new" className="btn btn-soft"><Icon name="link" />Invite friends with a challenge</Link>
    </main>
  );
}
