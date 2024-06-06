import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the DiScammer E2E debug harness (Task Q1).
 *
 * baseURL resolution:
 *   - E2E_BASE_URL set  → run against that origin (CI runs docker compose and
 *     points here). No local webServer is launched in that mode.
 *   - E2E_BASE_URL unset → launch the FastAPI app locally via uvicorn (the
 *     `webServer` block below) and target 127.0.0.1:8000.
 *
 * Chromium browsers are already installed in the default ms-playwright cache,
 * so we do NOT override PLAYWRIGHT_BROWSERS_PATH.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';

// Only manage a local server when we are NOT pointed at an external origin.
const useLocalServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: '.',
  // Only pick up *.spec.ts at the e2e root; never descend into node_modules.
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Keep video off — traces + screenshots are enough for debugging and far
    // cheaper to upload from CI.
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // When no external base URL is supplied, boot the app ourselves. The command
  // runs from the e2e/ dir, so we cd up to the repo root and invoke the venv's
  // uvicorn exactly as the project does (main:app, --app-dir backend).
  ...(useLocalServer
    ? {
        webServer: {
          command:
            "bash -c 'cd .. && backend/.venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000'",
          url: 'http://127.0.0.1:8000/api/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }
    : {}),
});
