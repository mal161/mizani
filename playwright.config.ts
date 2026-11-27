import { defineConfig } from "@playwright/test";

// Tests that inspect the database need the same env as the app.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local (CI): rely on the environment
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90000,
  // One worker: all tests share one dev server, and OneDrive-synced .next folders corrupt under parallel load.
  workers: 1,
  // Dev server compiles routes on first hit; allow for that.
  expect: { timeout: 30000 },
  // channel "chromium" runs full Chromium in new-headless mode (no separate headless-shell download).
  use: { baseURL: "http://localhost:3100", channel: "chromium" },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100/en",
    reuseExistingServer: true,
    // Own build folder, so a developer's `npm run dev` on .next is never disturbed by test runs.
    env: { SMS_PROVIDER: "fake", OTP_TEST_CODE: "123456", AI_PROVIDER: "fake", OCR_PROVIDER: "fake", NEXT_DIST_DIR: ".next-e2e" },
    timeout: 180000,
  },
});
