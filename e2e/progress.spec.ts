import { expect, test, type Page } from '@playwright/test';

/**
 * Progress, the weekly review's proposal, quiet notifications and data
 * controls — the stage 12 acceptance criteria in a browser: charts carry text
 * and accessible names; empty and thin data say so honestly; the cap and quiet
 * hours shape what is sent; exports hold the person's own data for the range.
 *
 * Settings and next week are shared demo state (D76): phone project only, and
 * every setting changed is put back.
 */

async function saveNotifications(page: Page) {
  await page.getByRole('button', { name: 'Save notification settings' }).click();
  await expect(page.getByText('Notification settings saved.')).toBeVisible();
  await page.reload();
}

test.describe('progress: read-only', () => {
  test('charts have names, text summaries and a table; thin data is called thin', async ({
    page,
  }) => {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    await expect(page.getByTestId('progress-narrative').locator('li').first()).toBeVisible();

    const chart = page.getByRole('img', { name: /Things done per week/ });
    await expect(chart).toBeVisible();
    await page.getByText('Show as a table').first().click();
    await expect(page.getByRole('table', { name: /Things done per week/ })).toBeVisible();

    await page.getByRole('link', { name: 'Last 7 days' }).click();
    await expect(page.getByRole('img', { name: /Things done per day/ })).toBeVisible();
    await expect(page.getByTestId('observations-pending')).toContainText('at least 21 days');
    await expect(page.getByText('No combined score', { exact: false })).toBeVisible();
  });

  test('exports hold only the requested range, and refuse a bad one', async ({ page, request }) => {
    await page.goto('/progress?range=7');
    const href = await page.getByRole('link', { name: 'Export this range' }).getAttribute('href');
    const [, from, to] = /from=(\d{4}-\d{2}-\d{2})&to=(\d{4}-\d{2}-\d{2})/.exec(href ?? '') ?? [];
    expect(from && to).toBeTruthy();
    const ranged = await request.get(href!);
    expect(ranged.ok()).toBe(true);
    expect(ranged.headers()['content-disposition']).toContain(`arete-${from}-to-${to}.json`);
    const body = (await ranged.json()) as {
      range: unknown;
      tables: Record<string, Record<string, unknown>[]>;
    };
    expect(body.range).toEqual({ from, to });
    for (const rows of Object.values(body.tables)) {
      for (const row of rows) {
        const date = String(
          row['local_date'] ??
            row['localDate'] ??
            row['date'] ??
            row['weekStart'] ??
            row['startedOn'] ??
            row['started_on'],
        ).slice(0, 10);
        expect(date >= from! && date <= to!).toBe(true);
      }
    }
    const everything = await request.get('/api/export');
    const all = (await everything.json()) as { tables: Record<string, unknown[]> };
    expect(Object.keys(all.tables).length).toBeGreaterThanOrEqual(Object.keys(body.tables).length);
    expect((await request.get(`/api/export?from=${to}&to=${from}`)).status()).toBe(
      from === to ? 200 : 400,
    );
    expect((await request.get('/api/export?from=nonsense&to=2026-01-01')).status()).toBe(400);
  });

  test('deleting everything needs the phrase typed, and can be called off', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('link', { name: 'Export or delete' }).click();
    await page.getByRole('button', { name: 'Delete my account and data' }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Delete everything' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Type “delete everything” to confirm/).fill('delete');
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('button', { name: 'Keep my data' }).click();
    await expect(dialog).toBeHidden();
  });

  for (const path of [
    '/progress',
    '/progress?range=90',
    '/settings/notifications',
    '/settings/data',
  ]) {
    test(`${path} hydrates without errors and fits the screen`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

/** Back to the defaults: everything off, quiet 22:00–07:00, two a day, nothing muted. */
async function restoreNotifications(page: Page) {
  await page.goto('/settings/notifications');
  for (const label of [
    'Today: the morning plan and the evening review',
    'Habits and tasks still open',
    'Training and flexibility days',
    'Programme days, like the reset',
    'The weekly review',
    'Remind me of my practice',
  ]) {
    const box = page.getByRole('checkbox', { name: label });
    if (await box.isChecked()) await page.getByText(label, { exact: true }).click();
  }
  if (!(await page.getByRole('checkbox', { name: /Bundle the small reminders/ }).isChecked()))
    await page.getByText('Bundle the small reminders into one').click();
  for (const name of ['Morning plan', 'Evening review', 'Things still open']) {
    await page.getByRole('textbox', { name }).fill('');
  }
  await page.getByLabel('Quiet from').fill('22:00');
  await page.getByLabel('Quiet until').fill('07:00');
  await page.getByText('2', { exact: true }).click();
  for (const unmute of await page.getByRole('button', { name: 'Unmute' }).all())
    await unmute.click();
  await saveNotifications(page);
  await expect(page.getByTestId('notification-plan')).toHaveText('Nothing would be sent today.');
}

test.describe.serial('progress: notifications and next week', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'One shared demo account; edited in place.');
    test.setTimeout(120_000);
  });

  test('quiet hours, the cap and a practice reminder shape what is sent; a due one can be dismissed', async ({
    page,
  }) => {
    try {
      await page.goto('/settings/notifications');
      await page.getByText('Today: the morning plan and the evening review').click();
      await page.getByRole('textbox', { name: 'Morning plan' }).fill('06:15');
      await page.getByText('Remind me of my practice').click();
      await page.getByLabel('In your words').fill('Evening practice, as I wrote it');
      await page.getByLabel('At', { exact: true }).fill('18:00');
      await page.getByText('1', { exact: true }).click();
      await saveNotifications(page);
      const firstDay = page.getByTestId('notification-withheld').getByText(/first day/);
      test.skip(
        await firstDay.isVisible(),
        'Onboarding finished today: nothing is sent on a first day.',
      );

      // 06:15 is in quiet hours (22:00–07:00), so it moves to 07:00; a cap of one holds the rest back.
      await expect(page.getByTestId('notification-plan')).toContainText(
        '07:00 — Your day is ready',
      );
      await expect(page.getByTestId('notification-plan')).not.toContainText('18:00');
      await expect(page.getByTestId('notification-withheld')).toContainText('daily limit of 1');

      // With room, the practice reminder appears in the person's own words.
      await page.getByText('3', { exact: true }).click();
      await saveNotifications(page);
      await expect(page.getByTestId('notification-plan')).toContainText(
        '18:00 — Evening practice, as I wrote it',
      );

      // Due at any time of day: quiet hours shrunk, morning plan just after midnight.
      await page.getByLabel('Quiet from').fill('00:00');
      await page.getByLabel('Quiet until').fill('00:01');
      await page.getByRole('textbox', { name: 'Morning plan' }).fill('00:02');
      await saveNotifications(page);
      await page.goto('/today');
      const reminder = page.getByTestId('reminder-morning_plan');
      if (await reminder.isVisible()) {
        await reminder.getByRole('button', { name: /^Dismiss:/ }).click();
        await expect(page.getByText(/Dismissed|muted/)).toBeVisible();
        await expect(reminder).toHaveCount(0);
      }
    } finally {
      await restoreNotifications(page);
    }
  });

  test('next week is proposed, and only what is ticked is added', async ({ page }) => {
    await page.goto('/reflect');
    const proposal = page.getByTestId('week-proposal');
    await expect(proposal.getByRole('heading', { name: 'A proposal for next week' })).toBeVisible();
    const add = proposal.getByRole('button', { name: /to next week$/ });
    await expect(add).toBeDisabled();
    const day = proposal
      .getByRole('group')
      .filter({ has: page.getByRole('checkbox') })
      .last();
    const dayName = (await day.locator('legend').textContent()) ?? '';
    const box = day.getByRole('checkbox').first();
    const name =
      (await box.getAttribute('aria-label')) ?? (await box.locator('xpath=..').innerText());
    const title = name.split('\n')[0]!;
    await box.check();
    await proposal.getByRole('button', { name: 'Add 1 to next week' }).click();
    await expect(page.getByText('1 added to next week.')).toBeVisible();
    // Proposed again, that item is no longer offered on that day.
    await page.reload();
    const sameDay = proposal.getByRole('group', { name: dayName });
    await expect(sameDay.getByText(title, { exact: true })).toHaveCount(0);
  });
});
