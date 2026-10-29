import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.oshitrip.app", appName: "OshiTrip", webDir: "mobile-dist",
  server: { androidScheme: "https" },
  android: { allowMixedContent: false, backgroundColor: "#faf9f6" },
};
export default config;
