import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const replitChromiumPath = "/repl/tools/bin/chromium";
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(replitChromiumPath) ? replitChromiumPath : undefined);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions: chromiumPath
      ? { executablePath: chromiumPath, args: ["--no-sandbox"] }
      : undefined,
  },
  webServer: {
    command: "pnpm --filter @workspace/verifee run dev",
    url: "http://127.0.0.1:4173",
    env: {
      PORT: "4173",
      BASE_PATH: "/",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
});