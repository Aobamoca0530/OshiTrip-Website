import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", workers: 2,
  use: { baseURL: "http://127.0.0.1:4173", ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: { command: "node node_modules/vite/bin/vite.js preview --config mobile/vite.config.ts --host 127.0.0.1 --port 4173", cwd: process.cwd(), url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
});
