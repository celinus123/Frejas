"use client";
/**
 * Invitation links you opened and answered "Not now" to. They are remembered on this device so the
 * invitation can be found again under Challenges. (Invitations sent inside the app live in the database.)
 */
const KEY = "frejas-saved-invites";

export function savedInvites(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20) : []; }
  catch { return []; }
}
export function saveInvite(token: string) {
  try { localStorage.setItem(KEY, JSON.stringify([token, ...savedInvites().filter((t) => t !== token)].slice(0, 20))); } catch { /* storage blocked */ }
}
export function forgetInvite(token: string) {
  try { localStorage.setItem(KEY, JSON.stringify(savedInvites().filter((t) => t !== token))); } catch { /* storage blocked */ }
}
