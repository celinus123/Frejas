import type { ReactNode } from "react";

export function Ring({ size, stroke, pct, track = "var(--soft)", color = "var(--primary)", cap = "round", children }:
  { size: number; stroke: number; pct: number; track?: string; color?: string; cap?: "round" | "butt"; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap={cap}
            strokeDasharray={`${(p / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray .4s ease" }} />
        )}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

/** Calendar day: full = all done, ring = share done, plain = nothing (never red). */
export function DayCircle({ day, fraction, today = false, future = false, size = 36, onClick }:
  { day: number; fraction: number | null; today?: boolean; future?: boolean; size?: number; onClick?: () => void }) {
  const label = <span style={{ fontSize: 13, fontWeight: today ? 800 : 700, color: future ? "var(--ink-2)" : undefined }}>{day}</span>;
  let inner;
  if (!future && fraction !== null && fraction >= 1) {
    inner = (
      <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{day}</div>
    );
  } else if (future || fraction === null) {
    inner = <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>{label}</div>;
  } else {
    inner = <Ring size={size} stroke={3.5} pct={fraction * 100} cap="butt">{label}</Ring>;
  }
  const wrapStyle = { borderRadius: "50%", background: today ? "var(--soft-l)" : undefined, boxShadow: today ? "0 0 0 3px var(--soft-l)" : undefined };
  if (onClick && !future)
    return <button onClick={onClick} aria-label={`Day ${day}`} style={{ ...wrapStyle, border: 0, padding: 0, background: wrapStyle.background ?? "none" }}>{inner}</button>;
  return <div style={wrapStyle}>{inner}</div>;
}
