import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Run tests sequentially
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3888",
    trace: "on",
  },
  webServer: {
    command: "npx http-server . -p 3888 -c-1",
    port: 3888,
    reuseExistingServer: !process.env.CI,
  },
});
