"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { BackBar, Empty, Sheet } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { loadHabits } from "@/lib/data";
import { formatShort, frequencyLabel } from "@/lib/dates";
import type { Habit } from "@/lib/types";

export default function Archive() {
  const { userId, toast } = useApp();
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [del, setDel] = useState<Habit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const all = await loadHabits(userId, true);
    setHabits(all.filter((h) => h.archived_at).sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? "")));
  }, [userId]);
  useEffect(() => { load().catch(() => setHabits([])); }, [load]);

  async function restore(h: Habit) {
    setBusy(h.id);
    const { error } = await supabase().from("habits").update({ archived_at: null }).eq("id", h.id);
    setBusy(null);
    if (error) { toast({ text: error.message }); return; }
    toast({ text: <><b>{h.name}</b> is back on Today.</> });
    load();
  }

  async function remove(h: Habit) {
    setDel(null);
    const { error } = await supabase().from("habits").delete().eq("id", h.id);
    if (error) { toast({ text: error.message }); return; }
    toast({ text: <><b>{h.name}</b> deleted.</> });
    load();
  }

  return (
    <main className="page">
      <BackBar />
      <h1 className="h1">Archived habits</h1>
      <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>Habits you've put away. Their history is kept, and you can bring them back any time.</p>

      {!habits ? <div className="skeleton" style={{ height: 160 }} />
        : habits.length === 0 ? (
          <Empty icon="archive" title="Nothing archived" text="Swipe a habit to the left on Today and choose Delete, then Archive instead, to put it away without losing its history." />
        ) : (
          <section className="card group">
            {habits.map((h) => (
              <div key={h.id} className="row">
                <Link href={`/habits/${h.id}`} style={{ flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
                  <div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>{h.name}</div>
                  <div className="muted" style={{ fontSize: "var(--t-sub)" }}>{frequencyLabel(h)} · archived {formatShort(h.archived_at!.slice(0, 10))}</div>
                </Link>
                <button className="btn btn-soft btn-sm" disabled={busy === h.id} onClick={() => restore(h)}>Restore</button>
                <button className="icon-btn" aria-label={`Delete ${h.name}`} onClick={() => setDel(h)} style={{ width: 40, height: 40, boxShadow: "none", background: "none" }}><Icon name="trash" size={18} /></button>
              </div>
            ))}
          </section>
        )}

      <Sheet open={!!del} onClose={() => setDel(null)} label="Delete habit">
        {del && (
          <>
            <div className="h1" style={{ fontSize: 24 }}>Delete {del.name}?</div>
            <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>This removes the habit and all its ticks for good. Check-ins you&apos;ve posted in challenges stay.</p>
            <button className="btn btn-primary" onClick={() => remove(del)}><Icon name="trash" />Delete for good</button>
            <button className="btn" style={{ background: "none" }} onClick={() => setDel(null)}>Cancel</button>
          </>
        )}
      </Sheet>
    </main>
  );
}
