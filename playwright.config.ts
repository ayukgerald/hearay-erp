import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

// The e2e server runs a production build with FakeProvider, dev sign-in and the test clock.
export const E2E_ENV = {
  DATABASE_URL: DATABASE_URL ?? "",
  DIRECT_URL: DATABASE_URL ?? "",
  APP_URL: `http://localhost:${PORT}`,
  UNSAFE_TEST_MODE: "1",
  PAYMENT_PROVIDER: "fake",
  FAKE_PROVIDER_DELAY_MS: "4000",
  FAKE_WEBHOOK_SECRET: "e2e-webhook",
  ALLOW_TEST_CLOCK: "1",
  DISABLE_RATE_LIMIT: "1",
  AUTH_MODE: "dev",
  DEV_ADMIN_PASSWORD: "e2e-password",
  SESSION_SECRET: "e2e-session-secret-0123456789",
  CRON_SECRET: "e2e-cron",
  SERVICE_FEE_XAF: "0",
  SMARTCARD_LENGTHS: "10",
  ORDER_EXPIRY_MINUTES: "10",
  SMS_PROVIDER: "console",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/packages`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: E2E_ENV,
    stdout: "pipe",
  },
});
