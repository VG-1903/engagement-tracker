import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the real UI against the real API and a dedicated Postgres database
 * (`engagement_e2e`) that is migrated and re-seeded at the start of every run.
 *
 *   npx playwright test            # headless
 *   npx playwright test --ui       # interactive
 */
const API_PORT = 8001;
const WEB_PORT = 3001;
const E2E_DB =
  process.env.E2E_DATABASE_URL ?? "postgresql+psycopg://postgres:postgres@localhost:5432/engagement_e2e";
const py = JSON.stringify(
  path.resolve(__dirname, "../backend/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
);

export const API_URL = `http://localhost:${API_PORT}`;

// Point at a deployment instead of local servers (the target database must be freshly seeded):
//   E2E_BASE_URL=https://web.example E2E_API_URL=https://api.example npx playwright test
const REMOTE = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // one shared, seeded database
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: REMOTE ?? `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    // Browser deliberately in a different timezone from the API's business day (Asia/Kolkata):
    // "Due today" labels must follow the server's date, not the viewer's clock.
    timezoneId: "America/New_York",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } }],
  webServer: REMOTE ? [] : [
    {
      command: `${py} -m alembic upgrade head && ${py} -m app.cli seed --reset && ${py} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `${API_URL}/health`,
      env: {
        DATABASE_URL: E2E_DB,
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        BCRYPT_ROUNDS: "4",
        LOG_LEVEL: "WARNING",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      env: { NEXT_PUBLIC_API_URL: API_URL },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
