import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated Playwright config for the VISUAL REGRESSION sweep (Task Q1).
 *
 * This is intentionally SEPARATE from playwright.config.ts so that:
 *   1. The regular e2e run (the 11 functional specs) never picks up
 *      visual.spec.ts — `testMatch` here is scoped to that one file, and the
 *      main config's `testMatch: '*.spec.ts'` would otherwise grab it. We keep
 *      the visual spec out of the default run by invoking this config
 *      EXPLICITLY (`-c visual.config.ts`); the visual spec also self-skips when
 *      run under any other config via a filename guard (see visual.spec.ts).
 *   2. Pixel-stable settings (fixed viewport, deviceScaleFactor, animations
 *      frozen, caret hidden) are pinned HERE without perturbing the functional
 *      config's device emulation.
 *
 * PLATFORM / BASELINE CONSTRAINT (read before regenerating):
 *   Playwright suffixes snapshots per-OS: `*-darwin.png` locally, `*-linux.png`
 *   in CI (docker / ubuntu-latest). Baselines from one OS DO NOT satisfy the
 *   other — fonts and sub-pixel rasterization differ. We commit the LOCAL
 *   darwin baselines (they prove the spec runs and are useful for local dev);
 *   the authoritative LINUX baselines must be seeded by a one-time CI run with
 *   `--update-snapshots`. See docs/deploy/visual-regression.md.
 *
 * Regenerate baselines (run from e2e/):
 *   npx playwright test visual.spec.ts -c visual.config.ts --update-snapshots
 */

// Flag that this run is the dedicated visual config. visual.spec.ts checks
// PW_VISUAL and self-skips when absent, so the main playwright.config.ts (whose
// testMatch '*.spec.ts' would otherwise grab visual.spec.ts) never tries to
// match it against nonexistent baselines. Set it here unconditionally.
process.env.PW_VISUAL = '1';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';

// Only manage a local server when we are NOT pointed at an external origin
// (mirrors playwright.config.ts).
const useLocalServer = !process.env.E2E_BASE_URL;

// Fixed desktop + mobile geometries. deviceScaleFactor is pinned so the raster
// resolution is deterministic regardless of the host display.
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: '.',
  // Scope strictly to the visual spec — nothing else in this config's run.
  testMatch: 'visual.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries for visual: a flaky pixel diff should surface, not be masked by
  // a lucky re-run.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Small per-pixel + ratio tolerance absorbs antialiasing jitter without
      // letting a real visual change slip through. Tighten if it proves loose.
      maxDiffPixelRatio: 0.01,
      // Freeze CSS animations/transitions and the typewriter blink so a capture
      // mid-frame is stable. JS-driven typewriter text is additionally masked
      // in the spec.
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP, deviceScaleFactor: DESKTOP.deviceScaleFactor },
    },
    {
      name: 'mobile',
      // Chromium-only (matches the e2e job). We borrow Pixel 5's chromium UA
      // surface but pin OUR own viewport/dsf for determinism rather than the
      // device's, so geometry never drifts with a Playwright device-table bump.
      use: {
        ...devices['Pixel 5'],
        viewport: { width: MOBILE.width, height: MOBILE.height },
        deviceScaleFactor: MOBILE.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

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
