"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { signedUrls } from "@/lib/photos";
import { D } from "@/lib/design";

export function Nav({ onPlus }: { onPlus?: () => void }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Today", icon: "sun" },
    { href: "/challenges", label: "Challenges", icon: "trophy" },
    null,
    { href: "/feed", label: "Feed", icon: "feed" },
    { href: "/stats", label: "Stats", icon: "stats" },
  ];
  return (
    <nav aria-label="Main" style={{ position: "fixed", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom) + 14px)", zIndex: 30, display: "flex", justifyContent: "center", padding: "0 16px", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", width: "100%", maxWidth: 448, height: 70, borderRadius: 35, background: "var(--nav)", boxShadow: "0 0 0 1px var(--nav-line), 0 2px 6px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.12)", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 6px" }}>
        {items.map((it, i) => {
          if (!it) return (
            <button key="plus" aria-label="Add" onClick={onPlus} className="btn-accent" style={{ width: 52, height: 52, borderRadius: "50%", border: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="plus" size={24} stroke={2.2} />
            </button>
          );
          const on = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <Link key={i} href={it.href} aria-current={on ? "page" : undefined} style={{ width: 62, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: on ? "var(--nav-on)" : "var(--ink-2)", fontSize: 11, fontWeight: on ? 800 : 600, textDecoration: "none" }}>
              <Icon name={it.icon} size={D.icon.nav} stroke={on ? 2.1 : 1.8} />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Sheet({ open, onClose, children, label, bare }: { open: boolean; onClose: () => void; children: ReactNode; label: string; bare?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={bare ? "sheet bare" : "sheet"} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {!bare && <div className="sheet-handle" />}
        {children}
      </div>
    </div>
  );
}

const shades = ["var(--soft)", "var(--soft-l)", "var(--accent-bg)", "var(--primary-l)"];

export function Avatar({ name, path, size = 36, url, ring }: { name: string; path?: string | null; size?: number; url?: string; ring?: string }) {
  const [src, setSrc] = useState<string | undefined>(url);
  useEffect(() => {
    if (url || !path) return;
    let live = true;
    signedUrls("avatars", [path]).then((m) => live && setSrc(m[path]));
    return () => { live = false; };
  }, [path, url]);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const bg = shades[(initial.charCodeAt(0) || 0) % shades.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.4), fontWeight: 800, border: ring ? `2px solid ${ring}` : undefined, boxSizing: "border-box" }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
    </div>
  );
}

export function Avatars({ people, size = 26, ring = "var(--surface)" }: { people: { name: string; path?: string | null }[]; size?: number; ring?: string }) {
  return (
    <div style={{ display: "flex" }}>
      {people.slice(0, 5).map((p, i) => (
        <div key={i} style={{ marginLeft: i ? -Math.round(size * 0.32) : 0 }}><Avatar name={p.name} path={p.path} size={size} ring={ring} /></div>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)} />;
}

export function BackBar({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      <button className="icon-btn" aria-label="Back" onClick={onBack ?? (() => history.back())}><Icon name="left" /></button>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
      {right ?? <div style={{ width: 44 }} />}
    </div>
  );
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ padding: "32px 22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ width: 110, height: 110, borderRadius: "50%", background: "var(--soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "center" }}>
        <Icon name={icon} size={50} stroke={1.5} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="font-display" style={{ fontSize: 22, fontWeight: 600 }}>{title}</div>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 6 }}>{text}</div>
      </div>
      {children}
    </div>
  );
}
