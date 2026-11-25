import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against a RUNNING stack (they make real model calls):
 *   make up                                  # or the deployed site
 *   cd frontend && npx playwright install chromium
 *   E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:8000 npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 180_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1360, height: 860 },
    trace: "retain-on-failure",
  },
});
