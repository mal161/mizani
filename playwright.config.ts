import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90000,
  // Dev server compiles routes on first hit; allow for that.
  expect: { timeout: 30000 },
  // channel "chromium" runs full Chromium in new-headless mode (no separate headless-shell download).
  use: { baseURL: "http://localhost:3100", channel: "chromium" },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100/en",
    reuseExistingServer: true,
    env: { SMS_PROVIDER: "fake", OTP_TEST_CODE: "123456" },
    timeout: 180000,
  },
});
