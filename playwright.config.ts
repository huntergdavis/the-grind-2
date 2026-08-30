import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 75_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4174/the-grind-2/",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4174",
    port: 4174,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
