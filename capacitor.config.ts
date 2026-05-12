import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "il.mondial2026.app",
  appName: "מונדיאל 2026",
  // Capacitor uses the static export folder produced by `BUILD_TARGET=capacitor next build`
  webDir: "out",
  server: {
    androidScheme: "https",
    // For development against running Next.js server, uncomment:
    // url: "http://10.0.2.2:3001",
    // cleartext: true,
  },
  android: {
    backgroundColor: "#0b1020",
  },
  ios: {
    backgroundColor: "#0b1020",
  },
};

export default config;
