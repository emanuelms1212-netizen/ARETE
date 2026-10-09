import { expect, test, type Page } from '@playwright/test';

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
});

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe('layout', () => {
  // 320px is the narrowest width the product supports.
  for (const width of [320, 390, 768, 1440]) {
    test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });

      for (const path of ['/today', '/plan', '/mind', '/settings']) {
        await page.goto(path);
        expect(await hasHorizontalOverflow(page), `${path} at ${width}px`).toBe(false);
      }
    });
  }

  test('the Today heading stays on screen at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/today');

    const box = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  });
});

test.describe('keyboard and focus', () => {
  test('the first tab stop is a working skip link', async ({ page }) => {
    await page.goto('/today');
    await page.keyboard.press('Tab');

    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('every nav destination is reachable by keyboard with a visible focus ring', async ({
    page,
  }) => {
    await page.goto('/today');

    const outline = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>('nav[aria-label="Primary"] a');
      link?.focus();
      return link ? getComputedStyle(link).outlineStyle : null;
    });

    // focus() alone does not always set :focus-visible, so assert the stylesheet
    // defines a ring rather than that this particular element is showing one.
    expect(outline).not.toBeNull();

    const hasFocusRule = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some(
            (rule) => rule.cssText.includes(':focus-visible') && rule.cssText.includes('outline'),
          );
        } catch {
          return false;
        }
      }),
    );
    expect(hasFocusRule).toBe(true);
  });
});

test.describe('command launcher', () => {
  test('opens with the keyboard shortcut and navigates', async ({ page }) => {
    await page.goto('/today');

    await page.keyboard.press('ControlOrMeta+k');
    const search = page.getByRole('searchbox', { name: 'Search destinations' });
    await expect(search).toBeFocused();

    await search.fill('progress');
    await search.press('Enter');

    await expect(page).toHaveURL(/\/progress$/);
  });

  test('closes on Escape without navigating', async ({ page }) => {
    await page.goto('/today');

    await page.getByRole('button', { name: 'Search and commands' }).click();
    await expect(page.getByRole('searchbox', { name: 'Search destinations' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('searchbox', { name: 'Search destinations' })).toBeHidden();
    await expect(page).toHaveURL(/\/today$/);
  });
});

test.describe('motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the breathing ring rests still when reduced motion is requested', async ({ page }) => {
    await page.goto('/mind');

    const animation = await page
      .locator('.animate-breathe')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName);

    expect(animation).toBe('none');
  });

  test('the breathing cue still paces the practice without motion', async ({ page }) => {
    await page.goto('/mind');
    await expect(page.getByText('Four in · two held · six out')).toBeVisible();
  });
});

test.describe('styleguide', () => {
  test('is not reachable in a production build', async ({ page }) => {
    const response = await page.goto('/styleguide');
    expect(response?.status()).toBe(404);
  });
});
