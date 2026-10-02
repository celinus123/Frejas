import { Avatars } from "./ui";

/** Who has already joined, on an invitation. The list holds at most five names. */
export function MembersIn({ names, count }: { names: string[]; count?: number }) {
  if (!names.length) return null;
  const first = names[0], n = count ?? names.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
      <Avatars people={names.map((x) => ({ name: x }))} size={30} />
      <div className="t-text"><b>{count === undefined && n >= 5 ? "5+" : n} {n === 1 ? "member" : "members"}</b><span className="muted"> · {n === 1 ? `${first} is in` : n === 2 ? `${first} and ${names[1]} are in` : `${first} and ${n >= 5 ? "others" : `${n - 1} more`} are in`}</span></div>
    </div>
  );
}
