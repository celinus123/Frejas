import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/nunito-sans";
import { AppProvider } from "@/components/AppProvider";
import { cssVars } from "@/lib/design";
import "./globals.css";


export const metadata: Metadata = {
  title: "Frejas",
  description: "Small habits, better together.",
  appleWebApp: { capable: true, title: "Frejas", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon-48.png", sizes: "48x48" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a0a11" },
  ],
};

// Applies the saved theme before first paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('orbit-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning style={cssVars as React.CSSProperties}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
