"use client";
import { Capacitor } from "@capacitor/core";

/** True inside the iPhone/Android app, false in a browser. */
export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

/** True where Frejas runs as an app: the iPhone/Android app, or the web app saved to a home screen. */
export const isAppLike = () => typeof window !== "undefined" && (isNative()
  || window.matchMedia?.("(display-mode: standalone)").matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** A light tap you can feel, e.g. when ticking a habit. Does nothing in a browser. */
export async function tap() {
  if (!isNative()) return;
  try { const { Haptics, ImpactStyle } = await import("@capacitor/haptics"); await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* ignore */ }
}

/** A happy buzz for bigger moments: a check-in, a finished day. */
export async function celebrate() {
  if (!isNative()) return;
  try { const { Haptics, NotificationType } = await import("@capacitor/haptics"); await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ }
}

/** The phone's own share sheet in the app. Returns false if it couldn't be shown. */
export async function nativeShare(opts: { title: string; text: string; url: string }): Promise<boolean> {
  if (!isNative()) return false;
  try { const { Share } = await import("@capacitor/share"); await Share.share({ ...opts, dialogTitle: opts.title }); return true; }
  catch (e) { return /cancel/i.test((e as Error).message ?? ""); }
}

/** Light or dark status bar text, following the app's theme. */
export async function syncStatusBar() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const forced = document.documentElement.getAttribute("data-theme");
    const dark = forced ? forced === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch { /* ignore */ }
}
