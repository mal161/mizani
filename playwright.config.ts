import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  // channel "chromium" runs full Chromium in new-headless mode (no separate headless-shell download).
  use: { baseURL: "http://localhost:3100", channel: "chromium" },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100/en",
    reuseExistingServer: true,
    timeout: 180000,
  },
});
