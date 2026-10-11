import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Smoke-level end-to-end config.
 *
 * Phone first: the primary project is an iPhone-sized viewport, because that is
 * the product's target. A desktop project runs the same specs to catch layouts
 * that only work at one width.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    // CI downloads Playwright's own Chromium. The sandbox this suite is run in
    // cannot reach `cdn.playwright.dev` and has one preinstalled instead, so it
    // points at that rather than carrying an uncommittable local patch.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
            args: ['--no-sandbox'],
          },
        }
      : {}),
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // Phone-shaped, but Chromium: the `iPhone 14` descriptor defaults to
      // WebKit, and CI installs only Chromium. A project whose browser is never
      // installed is a gate that quietly does not run.
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_MODE: 'demo',
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
});
