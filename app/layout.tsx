import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/nunito-sans";
import { AppProvider } from "@/components/AppProvider";
import { cssVars } from "@/lib/design";
import "./globals.css";


export const metadata: Metadata = {
  metadataBase: new URL("https://frejas.app"),
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
// Also marks the page when someone is on their way into the app (signed in, inside the iPhone app, or opened from a
// home screen), so that frejas.app shows them the app's loading state and never a glimpse of the website.
const themeScript = `try{var d=document.documentElement,t=localStorage.getItem('orbit-theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);`
  + `var a=false;for(var i=0;i<localStorage.length;i++){if(/^sb-.*-auth-token$/.test(localStorage.key(i)||'')){a=true;break}}`
  + `if(!a)a=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;`
  + `if(a)d.classList.add('has-app')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning style={cssVars as React.CSSProperties}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
