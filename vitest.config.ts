import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    env: loadEnv("test", process.cwd(), ""),
    fileParallelism: false,
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    // Setup creates real accounts (incl. MFA enrolment) on the hosted dev project.
    hookTimeout: 60000,
  },
});
