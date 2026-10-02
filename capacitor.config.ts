import type { CapacitorConfig } from "@capacitor/cli";

/*
 * The iPhone and Android apps load frejas.app inside a native shell, so every update you publish
 * reaches the apps right away. Native features (haptics, sharing, and later steps and notifications)
 * come from Capacitor plugins. native-shell/ holds the page shown when there is no connection.
 */
const config: CapacitorConfig = {
  appId: "app.frejas",
  appName: "Frejas",
  webDir: "native-shell",
  server: {
    url: "https://frejas.app",
    errorPath: "index.html",
  },
  backgroundColor: "#ffffff",
  ios: { contentInset: "never" },
  android: { allowMixedContent: false },
  plugins: {
    // a notification that arrives while the app is open is shown like any other
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    SplashScreen: { launchShowDuration: 700, launchAutoHide: true, backgroundColor: "#ffffff", showSpinner: false },
  },
};

export default config;
