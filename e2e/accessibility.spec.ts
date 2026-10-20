import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated accessibility checks on every route, in both themes, plus the
 * flows axe cannot judge: keyboard order, dialog focus, reduced motion,
 * 200% text, touch targets and timers that do not chatter.
 *
 * axe catches roughly a third of real problems. A pass here is a floor, not
 * a certificate; the manual checks are recorded in docs/ACCEPTANCE.md.
 */
const ROUTES = [
  '/today',
  '/plan',
  '/train',
  '/train/exercises',
  '/train/exercises/goblet-squat',
  '/train/flexibility',
  '/train/food',
  '/train/food?tab=week',
  '/train/food?tab=foods',
  '/train/food?tab=settings',
  '/mind',
  '/progress',
  '/progress?range=90',
  '/reflect',
  '/programs',
  '/programs/reset',
  '/programs/contrast',
  '/settings',
  '/settings/notifications',
  '/settings/data',
  '/settings/privacy',
  '/settings/safety',
  '/onboarding/health',
] as const;

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

test.describe('axe', () => {
  for (const route of ROUTES) {
    test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should load`).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  }

  test('the dark theme passes too', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const route of ['/today', '/train/food', '/settings/privacy', '/progress'] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await axe(page), route).toEqual([]);
    }
  });

  test('an open dialog passes, and traps focus until it closes', async ({ page }) => {
    await page.goto('/settings/privacy');
    const trigger = page.getByRole('button', { name: 'Delete: Body weight' });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await axe(page)).toEqual([]);

    // Tab round the dialog more times than it has controls. A native modal
    // dialog lets focus pass to the browser's own toolbar between laps (the
    // document then reports <body>), but never to anything on the page behind.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      const where = await dialog.evaluate((node) => {
        const active = document.activeElement;
        if (!active || active === document.body) return 'browser';
        return node.contains(active) ? 'dialog' : `page: ${active.outerHTML.slice(0, 80)}`;
      });
      expect(['dialog', 'browser']).toContain(where);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('keyboard-only core flows', () => {
  test('the safety overview and its stop guidance open from the keyboard', async ({ page }) => {
    await page.goto('/settings/safety');
    await page.waitForLoadState('networkidle');
    const summary = page.locator('summary', { hasText: 'During training' });
    // Hydration can replace the node once; focus the settled one.
    await expect(async () => {
      await summary.focus();
      await expect(summary).toBeFocused({ timeout: 500 });
    }).toPass();
    await page.keyboard.press('Enter');
    await expect(
      page.locator('details[open]').getByText('Chest pain, or trouble breathing'),
    ).toBeVisible();
  });

  test('a delete confirmation can be completed and cancelled without a pointer', async ({
    page,
  }) => {
    await page.goto('/settings/privacy');
    await page.getByRole('button', { name: 'Delete: Reminder history' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The safe choice has focus first.
    await expect(dialog.getByRole('button', { name: 'Keep it' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing on the main screens animates', async ({ page }) => {
    for (const route of ['/today', '/mind', '/train', '/programs/reset'] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const moving = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => {
            const style = getComputedStyle(element);
            const animated =
              style.animationName !== 'none' && parseFloat(style.animationDuration) > 0.01;
            const transitioning = parseFloat(style.transitionDuration) > 0.01;
            return animated || transitioning;
          })
          .map(
            (element) =>
              element.tagName.toLowerCase() +
              (element.className ? `.${String(element.className).split(' ')[0]}` : ''),
          ),
      );
      expect(moving, route).toEqual([]);
    }
  });
});

test.describe('text scaling and targets', () => {
  test('200% text does not push the page sideways', async ({ page }) => {
    for (const route of [
      '/today',
      '/settings/privacy',
      '/train/food',
      '/programs/reset',
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, route).toBeLessThanOrEqual(1);
    }
  });

  test('buttons and links in the main content are at least 24px, the WCAG 2.2 minimum', async ({
    page,
  }) => {
    for (const route of ['/today', '/settings/privacy', '/settings/safety', '/train'] as const) {
      await page.goto(route);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('main button, main a, main summary, main input')]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            if (box.width === 0 && box.height === 0) return false;
            // Links inside a sentence are exempt (WCAG 2.5.8 inline exception).
            if (element.tagName === 'A' && getComputedStyle(element).display === 'inline')
              return false;
            if (element instanceof HTMLInputElement && element.classList.contains('sr-only'))
              return false;
            return box.height < 24 || box.width < 24;
          })
          .map((element) =>
            (element.textContent ?? element.getAttribute('aria-label') ?? '').trim(),
          ),
      );
      expect(small, route).toEqual([]);
    }
  });
});

test.describe('timers speak only when it matters', () => {
  test('the focus timer has no live region ticking every second', async ({ page }) => {
    await page.goto('/today');
    const live = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[aria-live="polite"], [aria-live="assertive"], [role="timer"]',
        ),
      ].map((node) => ({
        role: node.getAttribute('role'),
        live: node.getAttribute('aria-live'),
        text: (node.textContent ?? '').trim().slice(0, 40),
      })),
    );
    // A clock face like "24:59" inside a live region would be read out every second.
    for (const region of live) {
      if (region.role === 'timer') expect(region.live ?? 'off', JSON.stringify(region)).toBe('off');
      else expect(region.text, JSON.stringify(region)).not.toMatch(/^\d{1,2}:\d{2}$/);
    }
  });
});
