import { expect, test, type Page } from '@playwright/test';

/**
 * Programmes and reflection, end to end — the stage 11 acceptance criteria in
 * a browser: the whole reset can be inspected and edited before it starts;
 * pausing and travel do not corrupt it; days 61–66 are an explicit choice;
 * the journal and the optional recovery pack land on the right local day.
 *
 * It edits the one shared demo account (D76), so it runs in the phone project
 * only, and it ends whatever it starts.
 */

async function endAnyReset(page: Page) {
  await page.goto('/programs/reset');
  const end = page.getByRole('button', { name: 'End the programme' });
  if (await end.isVisible()) {
    await end.click();
    await page.getByRole('dialog').getByRole('button', { name: 'End the programme' }).click();
    await expect(page.getByRole('button', { name: 'Start the programme' })).toBeVisible();
  }
}

/** Sets a switch on Today and waits until the server has it, across a reload. */
async function setSwitch(page: Page, label: string, on: boolean) {
  const box = page.getByRole('checkbox', { name: label });
  if ((await box.isChecked()) !== on) await page.getByText(label, { exact: true }).click();
  await expect(async () => {
    await page.reload();
    expect(await page.getByRole('checkbox', { name: label }).isChecked()).toBe(on);
  }).toPass({ timeout: 10_000 });
}

test.describe.serial('programmes: the reset, the journal and contrast therapy', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'One shared demo account; edited in place.');
    test.setTimeout(120_000);
  });

  test('the whole reset can be inspected and edited before it starts', async ({ page }) => {
    await endAnyReset(page);
    await page.goto('/plan');
    await page.getByRole('link', { name: /^Programmes/ }).click();
    await page.getByRole('link', { name: /^60-Day Reset/ }).click();

    const preview = page.getByTestId('programme-preview');
    await expect(preview).toContainText('60 days in 5 blocks');
    for (const block of ['Foundation', 'Build', 'Steady', 'Stretch', 'Consolidate']) {
      await expect(preview.getByRole('heading', { name: new RegExp(`^${block}`) })).toBeVisible();
    }
    // The source's own numbers are shown, and its 4 L is not what ARETE suggests.
    await expect(preview).toContainText('Source: 4 L');
    await expect(preview.getByText('4 L', { exact: true })).toHaveCount(0);
    // Days 61–66 are not there until chosen.
    await expect(preview.getByRole('heading', { name: /^Extension week/ })).toHaveCount(0);

    // Edit: an own range, and the extension week.
    if (!(await page.getByLabel('Reading from').isVisible())) {
      await page.getByText('Your own ranges (optional)').click();
    }
    await page.getByLabel('Reading from').fill('3');
    await page.getByLabel('Reading to').fill('4');
    await expect(preview.getByText('3–4 pages').first()).toBeVisible();
    await page.getByText('Add the extension week (days 61–66)').click();
    await expect(preview).toContainText('66 days in 6 blocks');
    await expect(preview.getByRole('heading', { name: /^Extension week/ })).toBeVisible();
    // Opt-ins are off.
    await expect(page.getByRole('checkbox', { name: /Cool finish to a shower/ })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Social media limit/ })).not.toBeChecked();

    await page.getByRole('button', { name: 'Start the programme' }).click();
    await expect(page.getByTestId('reset-day')).toHaveText('Day 1 of 66 · Foundation');
    await expect(page.getByTestId('reset-item-reading')).toContainText('3–4 pages');
  });

  test('a day is logged, and Today knows', async ({ page }) => {
    await page.goto('/programs/reset');
    await page.getByRole('button', { name: 'Done: reading' }).click();
    await expect(page.getByTestId('reset-item-reading')).toContainText('Done');
    await page.getByTestId('reset-item-study').getByRole('button', { name: 'Not today' }).click();
    await expect(page.getByTestId('reset-item-study')).toContainText('Not today');
    await page.reload();
    await expect(page.getByTestId('reset-item-reading')).toContainText('Done');

    await page.goto('/today');
    await expect(page.getByTestId('today-reset')).toContainText(/Day 1 of 66: 1 of \d+ done/);
  });

  test('a minimum day on Today shrinks the reset to its essentials', async ({ page }) => {
    await page.goto('/programs/reset');
    const full = await page.locator('[data-testid^="reset-item-"]').count();
    await page.goto('/today');
    await setSwitch(page, 'Run today at its minimum', true);
    await page.goto('/programs/reset');
    await expect(page.getByText(/A minimum day \(set on Today\)/)).toBeVisible();
    await expect(page.locator('[data-testid^="reset-item-"]')).not.toHaveCount(full);
    await expect(page.getByTestId('reset-item-movement')).toContainText('10 min');
    await page.goto('/today');
    await setSwitch(page, 'Run today at its minimum', false);
  });

  test('pausing and travel do not corrupt the schedule', async ({ page }) => {
    await page.goto('/programs/reset');
    await page.getByRole('button', { name: 'Pause from today' }).click();
    await expect(page.getByTestId('reset-day')).toHaveText('Paused on day 1 of 66');
    await page.goto('/today');
    await expect(page.getByTestId('today-reset')).toContainText('Paused');

    await page.goto('/programs/reset');
    await page.getByRole('button', { name: 'Resume today' }).click();
    // Same day, same logs: nothing skipped, nothing repeated.
    await expect(page.getByTestId('reset-day')).toHaveText('Day 1 of 66 · Foundation');
    await expect(page.getByTestId('reset-item-reading')).toContainText('Done');

    await page.getByRole('button', { name: 'Plan travel' }).click();
    const leaving = await page.getByLabel('Leaving').inputValue();
    const [y, m, d] = leaving.split('-').map(Number) as [number, number, number];
    const plus = (days: number) =>
      new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
    await page.getByLabel('Leaving').fill(plus(2));
    await page.getByLabel('Back').fill(plus(4));
    await page.getByRole('button', { name: 'Save the trip' }).click();
    await expect(page.getByText(/^Travelling from/)).toBeVisible();
    // An overlapping pause is refused, in words.
    await page.getByRole('button', { name: 'Plan travel' }).click();
    await page.getByLabel('Leaving').fill(plus(3));
    await page.getByLabel('Back').fill(plus(5));
    await page.getByRole('button', { name: 'Save the trip' }).click();
    await expect(page.getByText(/^That overlaps travelling from/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/^Travelling from/)).toHaveCount(0);
    await expect(page.getByTestId('reset-day')).toHaveText('Day 1 of 66 · Foundation');
  });

  test('the programme can be changed while it runs, and ended with its logs kept', async ({
    page,
  }) => {
    await page.goto('/programs/reset');
    await page.getByRole('button', { name: 'Change the programme' }).click();
    await page.getByLabel('Reading from').fill('6');
    await page.getByLabel('Reading to').fill('8');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('reset-item-reading')).toContainText('6–8 pages');

    await page.getByRole('button', { name: 'End the programme' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End the programme' }).click();
    await expect(page.getByText('Your last programme (ended early)')).toBeVisible();
    await expect(page.getByTestId('reset-summary')).toContainText('Something done on 1 of 66 days');
  });

  test('the Stoic journal: morning and evening on Today, the week on Reflect', async ({ page }) => {
    const stamp = Date.now();
    await page.goto('/today');
    await page.getByRole('button', { name: /^(Set an intention|Change)$/ }).click();
    await page.getByLabel('Mine to do').fill(`Start at nine ${stamp}`);
    await page.getByLabel('The quality I mean to practise').selectOption('courage');
    await page.getByLabel(/Today’s likely obstacle/).fill(`The afternoon slump ${stamp}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`The afternoon slump ${stamp}`)).toBeVisible();

    const write = page.getByRole('button', { name: 'Write the review' });
    if (await write.isVisible()) await write.click();
    await page.getByLabel('What did I do well?').fill(`Started on time ${stamp}`);
    await page.getByLabel('Where did judgement or impulse take over?').fill('Email first');
    await page.getByLabel('What did I learn?').fill(`Mornings are for writing ${stamp}`);
    await page.getByLabel('One adjustment for tomorrow').fill('Phone in the drawer');
    await page
      .getByRole('button', { name: /Save the review|Update the review|Save review/ })
      .click();
    await expect(page.getByText('Review saved.')).toBeVisible();

    await page.getByRole('link', { name: 'See the week and write the weekly review' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible();
    await expect(page.getByTestId('week-facts')).toContainText('Journal written on');
    await expect(page.getByText(`The afternoon slump ${stamp}`)).toBeVisible();
    await expect(page.getByText(`Mornings are for writing ${stamp}`)).toBeVisible();
    await expect(page.getByText('Courage')).toBeVisible();

    await page.getByLabel('What moved forward?').fill(`Steadier mornings ${stamp}`);
    await page.getByRole('button', { name: 'Save the review' }).click();
    await expect(page.getByText('Weekly review saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('What moved forward?')).toHaveValue(`Steadier mornings ${stamp}`);
  });

  test('contrast therapy is screened, timed, stoppable, and turns off completely', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/programs/contrast');
    const off = page.getByRole('button', { name: 'Turn contrast therapy off' });
    if (await off.isVisible()) {
      await off.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Turn it off' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Before contrast therapy' })).toBeVisible();

    // Every answer is needed; a yes needs a doctor's clearance.
    const saveAnswers = page.getByRole('button', { name: 'Save my answers' });
    await saveAnswers.click();
    await expect(page.getByText('Answer every question.')).toBeVisible();
    for (const group of await page.getByRole('group').all()) {
      const legend = (await group.locator('legend').textContent()) ?? '';
      if (/^High or low blood pressure/.test(legend))
        await group.getByText('Yes', { exact: true }).click();
      else if (await group.getByText('No', { exact: true }).isVisible())
        await group.getByText('No', { exact: true }).click();
    }
    await page.getByText('I have read the safety notice above').click();
    await saveAnswers.click();
    await expect(page.getByRole('heading', { name: 'Talk to a doctor first' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start the timer' })).toHaveCount(0);

    // Answer no: the timer appears, with the gentle default.
    await page.getByRole('button', { name: 'Update my answers' }).click();
    const bp = page.getByRole('group', { name: 'High or low blood pressure, or medicine for it' });
    await bp.getByText('No', { exact: true }).click();
    await page.getByText('I have read the safety notice above').click();
    await saveAnswers.click();
    const startTimer = page.getByRole('button', { name: 'Start the timer' });
    await expect(startTimer).toBeDisabled();
    await page.getByText('No alcohol in the last few hours').click();
    await page.getByText('Someone else is nearby if I use cold water').click();
    await startTimer.click();

    const runner = page.getByTestId('contrast-runner');
    await expect(runner.getByRole('heading', { name: 'Heat' })).toBeVisible();
    await expect(runner.getByRole('timer')).toHaveText('3:00');
    await page.clock.runFor(181_000);
    await expect(runner.getByRole('heading', { name: 'Cold' })).toBeVisible();
    await page.clock.runFor(31_000 + 181_000);
    await expect(page.getByText('Session recorded.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent sessions' })).toBeVisible();

    // Stopping is one tap, and dizziness points to help.
    await page.getByText('No alcohol in the last few hours').click();
    await page.getByText('Someone else is nearby if I use cold water').click();
    await page.getByRole('button', { name: 'Start the timer' }).click();
    await page.clock.runFor(5_000);
    await page.getByRole('button', { name: 'Stop now' }).click();
    await page.getByText('Dizzy or light-headed').click();
    await expect(page.getByTestId('after-stop')).toContainText('get medical help now');
    await expect(page.getByText(/Stopped: dizzy/)).toBeVisible();

    // Off, and everything with it.
    await page.getByRole('button', { name: 'Turn contrast therapy off' }).click();
    await page.getByRole('dialog').getByText('Delete my session history too').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Turn it off' }).click();
    await expect(page.getByRole('heading', { name: 'Before contrast therapy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent sessions' })).toHaveCount(0);
  });
});

test.describe('programmes: pages render cleanly', () => {
  for (const path of [
    '/programs',
    '/programs/reset',
    '/programs/contrast',
    '/reflect',
    '/train/food?tab=week',
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
