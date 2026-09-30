"use client";
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

const OPEN = -150; // how far the row slides to show its actions

/**
 * A card you can swipe left to reveal Edit and Delete.
 * Vertical scrolling still works; a tap on an open row just closes it.
 */
export function SwipeRow({ open, onOpenChange, onEdit, onDelete, label, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  label: string;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);
  const x = drag ?? (open ? OPEN : 0);

  function down(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? OPEN : 0 };
    moved.current = false;
  }
  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!moved.current) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { start.current = null; return; } // scrolling
      if (Math.abs(dx) < 8) return;
      moved.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setDrag(Math.max(OPEN - 30, Math.min(0, s.base + dx)));
  }
  function up() {
    if (start.current && moved.current && drag !== null) onOpenChange(drag < OPEN / 2);
    start.current = null;
    setDrag(null);
  }

  return (
    <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
      <div aria-hidden={!open} style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end", alignItems: "stretch", gap: 6, padding: 6, background: "var(--soft-l)" }}>
        <button onClick={() => { onOpenChange(false); onEdit(); }} tabIndex={open ? 0 : -1} aria-label={`Edit ${label}`}
          style={{ width: 66, border: 0, borderRadius: 14, background: "var(--surface)", color: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 12, fontWeight: 800 }}>
          <Icon name="edit" size={18} />Edit
        </button>
        <button onClick={() => { onOpenChange(false); onDelete(); }} tabIndex={open ? 0 : -1} aria-label={`Delete ${label}`}
          style={{ width: 66, border: 0, borderRadius: 14, background: "var(--primary)", color: "var(--on-primary)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 12, fontWeight: 800 }}>
          <Icon name="trash" size={18} />Delete
        </button>
      </div>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => {
          // a drag, or a tap while open, should not also open the habit or tick it
          if (moved.current || open) { e.preventDefault(); e.stopPropagation(); moved.current = false; if (open) onOpenChange(false); }
        }}
        style={{ position: "relative", transform: `translateX(${x}px)`, transition: drag === null ? "transform .22s ease" : "none", touchAction: "pan-y" }}>
        {children}
      </div>
    </div>
  );
}
