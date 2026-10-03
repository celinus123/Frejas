"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Challenge, CheckIn } from "@/lib/types";
import { addDays, formatShort, today } from "@/lib/dates";
import { logHabit } from "@/lib/data";
import { uploadCheckinPhoto } from "@/lib/photos";
import { celebrate } from "@/lib/native";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { track } from "@/lib/analytics";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  challenge: Challenge;
  userId: string;
  habitId: string | null;          // the habit linked to this challenge, if any
  habitName?: string;
  habitLogId?: string | null;      // when opened right after ticking the habit on Today
  existing?: CheckIn | null;       // edit mode
  minAmount?: number | null;       // a check-in only counts at or above this
  initialDate?: string;            // e.g. a past day picked on Today or in the week view
}

export function CheckInSheet({ open, onClose, onSaved, challenge, userId, habitId, habitName, habitLogId, existing, minAmount, initialDate }: Props) {
  const t = today();
  const maxDate = t < challenge.ends_on ? t : challenge.ends_on;
  const startDate = initialDate && initialDate <= maxDate && initialDate >= challenge.starts_on ? initialDate : maxDate;
  const [date, setDate] = useState(existing?.checkin_date ?? startDate);
  const [title, setTitle] = useState(existing?.title ?? habitName ?? challenge.name);
  const [amount, setAmount] = useState(existing?.amount?.toString() ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDate(existing?.checkin_date ?? startDate);
    setTitle(existing?.title ?? habitName ?? challenge.name);
    setAmount(existing?.amount?.toString() ?? "");
    setComment(existing?.comment ?? "");
    setFile(null); setPreview(null); setErr(null);
  }, [open, existing, habitName, challenge.name, startDate]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const yesterday = addDays(t, -1);
  const canYesterday = yesterday >= challenge.starts_on && yesterday <= challenge.ends_on;
  const whenMode = date === t ? "today" : date === yesterday ? "yesterday" : "pick";
  const amountNum = amount ? Number(amount.replace(",", ".")) : null;
  const needsAmount = !!challenge.unit;
  const unitLabel = challenge.unit === "min" ? "minutes" : challenge.unit;
  const valid = title.trim().length > 0 && (!needsAmount || (amountNum !== null && amountNum > 0 && isFinite(amountNum)));

  async function save() {
    if (!valid) return;
    setBusy(true); setErr(null);
    try {
      const photo_path = file ? await uploadCheckinPhoto(file, challenge.id, userId) : existing?.photo_path ?? null;
      const fields = { checkin_date: date, title: title.trim(), comment: comment.trim() || null, amount: needsAmount ? amountNum : null, photo_path };
      if (existing) {
        const { error } = await supabase().from("check_ins").update(fields).eq("id", existing.id);
        if (error) throw error;
      } else {
        let logId = habitLogId ?? null;
        if (!logId && habitId) logId = (await logHabit(habitId, userId, date)).id;
        const { error } = await supabase().from("check_ins").insert({ ...fields, challenge_id: challenge.id, user_id: userId, habit_log_id: logId });
        if (error) throw error;
      }
      if (!existing) { celebrate(); track("checkin_made", { photo: !!photo_path, note: !!comment.trim(), amount: needsAmount }); }
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Check in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="h1" style={{ fontSize: 24 }}>{existing ? "Edit check-in" : "Check in"}</div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="chip" aria-pressed="true"><Icon name="trophy" size={15} />{challenge.name}</span>
        {habitName && <span className="chip" aria-pressed="true"><Icon name="sun" size={15} />{habitName}</span>}
      </div>
      {habitName && !existing && <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", marginTop: -6 }}>Linked, so one check-in counts for both.</div>}

      <div className="label">When</div>
      <div className="seg">
        <button aria-pressed={whenMode === "today"} onClick={() => setDate(maxDate)} disabled={maxDate !== t}>Today</button>
        <button aria-pressed={whenMode === "yesterday"} onClick={() => setDate(yesterday)} disabled={!canYesterday}>Yesterday</button>
        <label style={{ flex: 1, position: "relative", display: "flex" }}>
          <button aria-pressed={whenMode === "pick"} style={{ flex: 1 }} onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement)?.showPicker?.()}>
            {whenMode === "pick" ? formatShort(date) : "Pick a day"}
          </button>
          <input type="date" aria-label="Pick a day" min={challenge.starts_on} max={maxDate} value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }} />
        </label>
      </div>

      {needsAmount && (
        <>
          <div className="label">{challenge.unit === "km" ? "Distance" : challenge.unit === "min" ? "Time" : "Amount"}</div>
          <div className="field" style={{ justifyContent: "center" }}>
            <input inputMode="decimal" aria-label={`Amount in ${unitLabel}`} placeholder="0" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              style={{ fontSize: 32, textAlign: "right", width: 140 }} className="font-display" />
            <span className="muted" style={{ fontSize: 16, fontWeight: 700 }}>{unitLabel}</span>
          </div>
          {!!minAmount && (
            <div className="muted" style={{ fontSize: "var(--t-sub)", padding: "0 4px", marginTop: -4 }}>
              Counts if {minAmount} {unitLabel} or more that day{amountNum !== null && amountNum > 0 && amountNum < minAmount ? " — you can still log it, and it adds up with other check-ins that day" : ""}.
            </div>
          )}
        </>
      )}

      <div className="label">Title</div>
      <label className="field"><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} aria-label="Title" /><Icon name="edit" size={18} /></label>

      <div className="label">Photo and comment <span style={{ fontWeight: 600 }}>· optional</span></div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => fileRef.current?.click()} aria-label="Add photo"
          style={{ width: 96, height: 96, flexShrink: 0, borderRadius: 20, border: preview ? 0 : "2px dashed var(--primary-l)", background: "var(--soft-l)", color: "var(--primary)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden", padding: 0 }}>
          {preview ? <img src={preview} alt="Selected" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <><Icon name="camera" size={26} stroke={1.7} /><span style={{ fontSize: 12, fontWeight: 800 }}>{existing?.photo_path ? "Replace" : "Photo"}</span></>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
        }} />
        <label className="field" style={{ flex: 1, alignItems: "flex-start", padding: "12px 14px" }}>
          <textarea aria-label="Comment" placeholder="How did it go?" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)}
            style={{ resize: "none", height: 70, fontWeight: 600 }} />
        </label>
      </div>
      {err && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700 }}>{err}</div>}
      <button className="btn btn-primary" disabled={!valid || busy} onClick={save}>
        <Icon name="check" stroke={2.4} />{busy ? "Saving…" : existing ? "Save" : "Check in"}
      </button>
    </Sheet>
  );
}
