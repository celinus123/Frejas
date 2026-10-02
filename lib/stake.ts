/**
 * What's at stake in a challenge is one line of text. It may start with an emoji the creator picked
 * ("🍰 Loser buys cake"); that emoji is then shown as the icon instead of the coffee cup.
 */
const LEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

export const STAKE_EMOJIS = ["🥐", "🍰", "🍕", "🥂", "🎁", "💸", "🧹", "🏆"] as const;
export const STAKE_MAX = 76; // the database allows 80 characters including the emoji

export function stakeParts(stake: string | null | undefined): { emoji: string | null; text: string } {
  const s = stake ?? "";
  const m = s.match(LEAD);
  return m ? { emoji: m[1], text: s.slice(m[0].length) } : { emoji: null, text: s };
}
export const joinStake = (emoji: string | null, text: string) => (text.trim() ? `${emoji ? `${emoji} ` : ""}${text.trim()}` : "");
