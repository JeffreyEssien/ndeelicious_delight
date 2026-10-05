import fs from "node:fs";
import { defineConfig } from "@playwright/test";
import { validateBrowserEnvironment } from "./src/lib/security/test-environment";

validateBrowserEnvironment(process.env);

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const adminStorage = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE;
const storageState = adminStorage
  ? adminStorage.trim().startsWith("{")
    ? JSON.parse(adminStorage)
    : fs.existsSync(adminStorage)
      ? adminStorage
      : (() => {
          throw new Error("PLAYWRIGHT_ADMIN_STORAGE_STATE file does not exist.");
        })()
  : undefined;

const viewports = [
  ["phone-320", 320, 568],
  ["phone-375", 375, 667],
  ["phone-390", 390, 844],
  ["phone-430", 430, 932],
  ["tablet-portrait", 768, 1024],
  ["tablet-landscape", 1024, 768],
  ["desktop", 1440, 900],
] as const;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/playwright",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  fullyParallel: false,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    storageState,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 45_000,
  },
  projects: viewports.map(([name, width, height]) => ({ name, use: { viewport: { width, height } } })),
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
