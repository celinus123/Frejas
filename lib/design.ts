/**
 * Frejas design rules: one place for the sizes of text, icons, reactions and cards.
 * The values were set in the design lab (2 Oct 2026). CSS reads them as variables
 * (see `cssVars`, applied on <html>), and components that need numbers import `D`.
 *
 * Every piece of text belongs to one of the eight text roles.
 */
export const D = {
  text: {
    display: 31,   // page heading: "Feed", "Hi, Celina", "1 of 3 done"
    section: 18,   // section heading: "Today", "This week", a post's title when opened
    title: 14,     // card and row title: "Pilates", "Walk 30 min"
    text: 12.5,    // running text: comments in a thread, short descriptions
    sub: 12,       // supporting line on a card: "Class 4 of 12…", "Daily", "3× / week"
    meta: 11,      // name, time and counts
    tag: 11,       // labels: challenge name, category
    comment: 9.5,  // the comment bubble on a photo
  },
  icon: { action: 15, inline: 12, nav: 23 },
  emoji: { pick: 15, pickGap: 4, pickPad: 6, sum: 10, sumGap: -0.5 },
  avatar: { post: 38, comment: 15, friend: 40 },   // post: the same on check-ins, habit cards and update tiles
  bubble: { pad: 3.5, maxWidth: 60, dark: 0.4, x: 8, y: 7, lines: 2, showName: false },
  card: { radius: 19, pad: 13, rowGap: 5, colGap: 11, ratio: "1 / 1", pickerX: 2, pickerY: 7, whoOnPhoto: true },
} as const;

/** Reactions, in the order they appear in the picker. The database accepts exactly these. */
export const EMOJIS = ["❤️", "😍", "😊", "👏", "⚡"] as const;
export type Emoji = (typeof EMOJIS)[number];

/** Lines under a photo come in this order: title, challenge, caption, then reactions and comments. */

const px = (n: number) => `${n}px`;
export const cssVars: Record<string, string> = {
  "--t-display": px(D.text.display), "--t-section": px(D.text.section), "--t-title": px(D.text.title), "--t-text": px(D.text.text),
  "--t-sub": px(D.text.sub), "--t-meta": px(D.text.meta), "--t-tag": px(D.text.tag), "--t-comment": px(D.text.comment),
  "--i-action": px(D.icon.action), "--i-inline": px(D.icon.inline), "--i-nav": px(D.icon.nav),
  "--e-pick": px(D.emoji.pick), "--e-pick-gap": px(D.emoji.pickGap), "--e-pick-pad": px(D.emoji.pickPad), "--e-sum": px(D.emoji.sum), "--e-sum-gap": px(D.emoji.sumGap),
  "--a-post": px(D.avatar.post), "--a-comment": px(D.avatar.comment), "--a-friend": px(D.avatar.friend),
  "--c-pad": px(D.bubble.pad), "--c-w": `${D.bubble.maxWidth}%`, "--c-op": String(D.bubble.dark), "--c-x": px(D.bubble.x), "--c-y": px(D.bubble.y), "--c-lines": String(D.bubble.lines),
  "--card-r": px(D.card.radius), "--card-pad": px(D.card.pad), "--row-gap": px(D.card.rowGap), "--col-gap": px(D.card.colGap), "--photo-ratio": D.card.ratio,
  "--p-x": px(D.card.pickerX), "--p-y": px(D.card.pickerY),
};
