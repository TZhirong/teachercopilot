import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8888",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npx next dev -p 8888",
    url: "http://localhost:8888",
    reuseExistingServer: true,
    timeout: 180_000
  }
});
