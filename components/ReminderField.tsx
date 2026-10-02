"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { pushState, type PushState } from "@/lib/push";

/** A time of day to be reminded, or none. `when` says which days it applies to ("every day", "on Mon, Wed"). */
export function ReminderField({ value, onChange, when }: { value: string; onChange: (v: string) => void; when: string }) {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => { pushState().then(setState); }, []);
  return (
    <>
      <div className="card" style={{ padding: "8px 8px 8px 16px", display: "flex", alignItems: "center", gap: 12, minHeight: 56 }}>
        <Icon name="bell" color="var(--primary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--t-title)", fontWeight: 700 }}>Remind me</div>
          <div className="muted" style={{ fontSize: "var(--t-sub)" }}>{value ? `${when} at ${value}` : "No reminder"}</div>
        </div>
        <input type="time" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Time of the reminder"
          style={{ height: 40, padding: "0 10px", borderRadius: 12, border: 0, background: "var(--soft-l)", fontWeight: 800, fontSize: 16, minWidth: 96 }} />
        {value && <button type="button" onClick={() => onChange("")} aria-label="Remove the reminder" className="muted" style={{ width: 36, height: 36, border: 0, background: "none" }}><Icon name="x" size={16} stroke={2.2} /></button>}
      </div>
      {value && state === "unavailable" && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px" }}>Reminders arrive in the iPhone app.</div>}
      {value && state === "denied" && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", color: "var(--ink)" }}>Notifications are off for Frejas. Turn them on in your iPhone&apos;s Settings to get this reminder.</div>}
    </>
  );
}
