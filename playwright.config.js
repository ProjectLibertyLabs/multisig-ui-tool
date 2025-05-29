import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Run tests sequentially
  timeout: 180000, // 3 minutes total timeout
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Only use 1 worker
  reporter: "html",
  use: {
    baseURL: "http://localhost:3888",
    trace: "on",
    actionTimeout: 60000, // 1 minute action timeout
    navigationTimeout: 60000, // 1 minute navigation timeout
  },
  webServer: {
    command: "npx http-server . -p 3888 -c-1",
    port: 3888,
    timeout: 120000, // 2 minute server startup timeout
    reuseExistingServer: !process.env.CI,
  },
});
