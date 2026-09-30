"use client";
import { useEffect, useState } from "react";
import type { CoverPreset } from "@/lib/types";
import { signedUrls } from "@/lib/photos";

export const PRESETS: CoverPreset[] = ["arches", "waves", "sun", "dots", "leaf", "stripes"];

const S = "var(--soft)", SL = "var(--soft-l)", PL = "var(--cover)", AB = "var(--accent-bg)", W = "var(--surface)";

function Shapes({ kind }: { kind: CoverPreset }) {
  switch (kind) {
    case "arches":
      return <><rect width="320" height="160" fill={AB} /><path d="M40 160 V100 a50 50 0 0 1 100 0 V160Z" fill={S} /><path d="M150 160 V80 a60 60 0 0 1 120 0 V160Z" fill={PL} /><circle cx="250" cy="42" r="16" fill={W} /></>;
    case "waves":
      return <><rect width="320" height="160" fill={SL} /><path d="M0 90 Q80 60 160 90 T320 90 V160 H0Z" fill={S} /><path d="M0 118 Q80 92 160 118 T320 118 V160 H0Z" fill={PL} /><circle cx="70" cy="45" r="18" fill={AB} /></>;
    case "sun":
      return <><rect width="320" height="160" fill={S} /><circle cx="160" cy="118" r="70" fill={AB} /><circle cx="160" cy="118" r="44" fill={W} /><rect y="130" width="320" height="30" fill={PL} /></>;
    case "dots":
      return <><rect width="320" height="160" fill={SL} />{Array.from({ length: 32 }, (_, i) => <circle key={i} cx={30 + (i % 8) * 38} cy={28 + Math.floor(i / 8) * 36} r={7 + ((i * 7) % 6)} fill={[S, PL, AB, W][i % 4]} />)}</>;
    case "leaf":
      return <><rect width="320" height="160" fill={SL} /><path d="M60 150 C60 70 130 30 230 24 C228 110 170 150 60 150Z" fill={PL} /><path d="M60 150 L190 60" stroke={SL} strokeWidth="4" fill="none" /><circle cx="262" cy="118" r="22" fill={AB} /></>;
    default:
      return <><rect width="320" height="160" fill={SL} />{Array.from({ length: 8 }, (_, i) => <rect key={i} x={i * 40} y={40 + (i % 3) * 18} width="30" height={120 - (i % 3) * 18} rx="15" fill={[S, PL, AB][i % 3]} />)}</>;
  }
}

/** A challenge's header: its uploaded photo, or an illustrated preset in the app's colours. */
export function Cover({ preset, path, height, radius = 0, width = "100%", src }:
  { preset?: CoverPreset | null; path?: string | null; height: number; radius?: number; width?: number | string; src?: string | null }) {
  const [url, setUrl] = useState<string | null>(src ?? null);
  useEffect(() => {
    if (src) { setUrl(src); return; }
    if (!path) { setUrl(null); return; }
    let live = true;
    signedUrls("covers", [path]).then((m) => live && setUrl(m[path] ?? null));
    return () => { live = false; };
  }, [path, src]);
  return (
    <div style={{ width, height, borderRadius: radius, overflow: "hidden", flexShrink: 0, background: "var(--soft-l)" }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <svg width="100%" height="100%" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block" }}><Shapes kind={preset ?? "waves"} /></svg>}
    </div>
  );
}
