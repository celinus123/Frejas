const P: Record<string, string> = {
  check: "M5 12.5l4.2 4.2L19 7",
  flame: "M12 3c.6 3.4 5 5.3 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.8 2.4-4.8.2 1.5.9 2.4 2 2.7-.5-3-.3-5.3.6-7.9z",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z",
  comment: "M5 5.5h14a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1h-8l-4.5 3.5V16H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5.5a2.5 2.5 0 0 0 2.7 3.6M16 6h2.5a2.5 2.5 0 0 1-2.7 3.6M12 13v4M8.5 20h7",
  feed: "M6 4h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM15 4h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM6 15h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2zM15 12h3a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z",
  stats: "M6 20v-7M12 20V5M18 20v-10",
  bell: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0",
  right: "M9.5 6l6 6-6 6",
  left: "M14.5 6l-6 6 6 6",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
  calendar: "M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5zM4 10h16M8.5 3v4M15.5 3v4",
  coffee: "M5 9h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M12 3.5v2.5",
  users: "M9 5.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM3.5 19a5.5 5.5 0 0 1 11 0M15.5 6.2a3 3 0 0 1 0 5.6M17 14.2a5 5 0 0 1 3.5 4.8",
  x: "M6 6l12 12M18 6L6 18",
  lock: "M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3",
  camera: "M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  edit: "M5 19h4L19.5 8.5l-4-4L5 15z",
  share: "M12 4v11M8 8l4-4 4 4M5 13v6h14v-6",
  copy: "M10 8h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 16V5.5A1.5 1.5 0 0 1 6.5 4H15",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8",
  moon: "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z",
  mail: "M6 5.5h12A2.5 2.5 0 0 1 20.5 8v8a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 16V8A2.5 2.5 0 0 1 6 5.5zM4 7l8 6 8-6",
  download: "M12 4v11M8 11l4 4 4-4M5 19h14",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  archive: "M5 5h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM5.5 9v9.5h13V9M10 13h4",
  logout: "M10 5H5.5v14H10M14 8l4 4-4 4M18 12H9",
  shield: "M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z",
  user: "M12 4.7a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM4.5 20a7.5 7.5 0 0 1 15 0",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.2l2.8 1.8",
  draft: "M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 13h5M9.5 16.5h3",
  send: "M4.5 12L20 4.5 15 20l-3-6z",
  repeat: "M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  block: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM6.4 6.4l11.2 11.2",
  leaf: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7",
  up: "M6 14.5l6-6 6 6",
  down: "M6 9.5l6 6 6-6",
};

export function Icon({ name, size = 20, stroke = 1.9, fill = "none", color = "currentColor" }:
  { name: keyof typeof P | string; size?: number; stroke?: number; fill?: string; color?: string }) {
  const round = name === "more";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={round ? 3 : stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      <path d={P[name] ?? ""} />
    </svg>
  );
}

export function Flame({ size = 18 }: { size?: number }) {
  return <Icon name="flame" size={size} color="var(--accent)" fill="var(--flame-fill)" />;
}
