import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('the root redirects to Today and renders the day', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Minimum day')).toBeVisible();
    await expect(page.getByText(/Demo data/)).toBeVisible();
  });

  test('primary navigation reaches every destination', async ({ page }) => {
    await page.goto('/today');

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link')).toHaveCount(5);

    for (const [label, path] of [
      ['Plan', '/plan'],
      ['Train', '/train'],
      ['Mind', '/mind'],
      ['Progress', '/progress'],
      ['Today', '/today'],
    ] as const) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('settings is reachable from the header, not the tab bar', async ({ page }) => {
    await page.goto('/today');

    await page.getByRole('link', { name: 'Profile and settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('an unknown route renders the not-found state', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');

    expect(response?.status()).toBe(404);
    await expect(page.getByText('That page does not exist.')).toBeVisible();
  });

  test('the health endpoint reports the build', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'ok', name: 'arete', mode: 'demo' });
  });

  test('the manifest is served and points at real icons', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const manifest = (await response.json()) as { icons: { src: string }[] };
    expect(manifest.icons.length).toBeGreaterThan(0);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok(), `${icon.src} should be served`).toBe(true);
    }
  });

  test('the page has no horizontal overflow at phone width', async ({ page }) => {
    await page.goto('/today');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
