import { Avatars } from "./ui";

/** Who has already joined, on an invitation. The list holds at most five names. */
export function MembersIn({ names }: { names: string[] }) {
  if (!names.length) return null;
  const first = names[0], n = names.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
      <Avatars people={names.map((x) => ({ name: x }))} size={30} />
      <div className="t-text"><b>{n >= 5 ? "5+" : n} {n === 1 ? "member" : "members"}</b><span className="muted"> · {n === 1 ? `${first} is in` : n === 2 ? `${first} and ${names[1]} are in` : `${first} and ${n >= 5 ? "others" : `${n - 1} more`} are in`}</span></div>
    </div>
  );
}
