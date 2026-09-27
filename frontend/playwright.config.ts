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

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // one shared, seeded database
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } }],
  webServer: [
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
