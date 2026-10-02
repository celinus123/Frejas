import { Icon } from "./Icon";
import { stakeParts } from "@/lib/stake";

/** The icon for what's at stake: the emoji the creator picked, otherwise the coffee cup. */
export function StakeIcon({ stake, size = 18 }: { stake: string | null | undefined; size?: number }) {
  const { emoji } = stakeParts(stake);
  return emoji ? <span className="em" aria-hidden="true" style={{ fontSize: size - 2, width: size, textAlign: "center", flexShrink: 0 }}>{emoji}</span>
    : <Icon name="coffee" size={size} color="var(--accent)" />;
}
export const stakeText = (stake: string | null | undefined) => stakeParts(stake).text;

/** The cream "at stake" line on a challenge. */
export function StakeLine({ stake }: { stake: string }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 16, background: "var(--accent-bg)", fontSize: 13, fontWeight: 700 }}><StakeIcon stake={stake} />{stakeText(stake)}</div>;
}
