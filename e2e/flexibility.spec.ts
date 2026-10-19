import { expect, test, type Page } from '@playwright/test';

/**
 * Flexibility, end to end — the stage 9 acceptance criteria, in a browser:
 * schedule three sessions, complete them in any order, miss one without
 * breaking the programme, see animation and text instructions, and compare
 * weekly self-reports.
 *
 * Like the workout journey (D76) this drives the one shared demo account's
 * single running session, so it runs in the phone project only. The holds are
 * real 30-second timers; the test installs a fake clock and runs it forward
 * rather than waiting.
 */

async function stopAnyRunningSession(page: Page) {
  const stop = page.getByRole('button', { name: /^Stop — sharp/ });
  if (await stop.isVisible()) {
    await stop.click();
    await page.getByRole('button', { name: 'Stop the session' }).click();
    await expect(page.getByTestId('flex-summary')).toBeVisible();
  }
}

async function freshProgramme(page: Page) {
  await page.goto('/train/flexibility');
  // Wait for hydration: a click on a server-rendered button before React is
  // attached does nothing, which made this helper flaky.
  await page.waitForLoadState('networkidle');
  await stopAnyRunningSession(page);
  const end = page.getByRole('button', { name: /^(End the programme|Finish and start again)$/ });
  const baseline = page.getByRole('button', { name: 'Next: a quick baseline' });
  await expect(async () => {
    if (await end.isVisible()) {
      await end.click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^(End the programme|Finish)$/ })
        .click({ timeout: 2_000 });
    }
    await expect(baseline).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Works through whatever movements are left in the running session. */
async function doRemainingMovements(page: Page) {
  const finish = page.getByRole('button', { name: 'Finish the session' });
  for (let guard = 0; guard < 20 && !(await finish.isVisible()); guard += 1) {
    const movement = page.getByTestId('flex-movement');
    await expect(movement.or(finish).first()).toBeVisible();
    if (await finish.isVisible()) break;

    const doneReps = movement.getByRole('button', { name: /^Done \d+ reps$/ });
    const startHold = movement.getByRole('button', { name: /^(Start|Resume) hold$/ });
    const save = movement.getByRole('button', { name: /^Save/ });

    for (let set = 0; set < 4 && !(await save.isEnabled()); set += 1) {
      if (await doneReps.isVisible()) await doneReps.click();
      else if (await startHold.isVisible()) {
        await startHold.click();
        await page.clock.runFor(31_000);
      }
    }
    await save.click();
    // Saved once the step is replaced by the next side or movement: a fresh
    // step has no sets done yet.
    await expect(async () => {
      if (await finish.isVisible()) return;
      await expect(movement.getByText('All sets done.')).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 10_000 });
  }
}

test.describe('flexibility: read-only', () => {
  test('names its source and that it is used with permission', async ({ page }) => {
    await page.goto('/train/flexibility');
    await expect(page.getByRole('heading', { level: 1, name: 'Flexibility' })).toBeVisible();
    await expect(page.getByText(/Total Flexibility - V2\.pdf/)).toBeVisible();
    // Cleared with the author's permission (D85): no demo-only warning.
    await expect(page.getByText(/Used with the author’s permission/)).toBeVisible();
    await expect(page.getByText(/has not been confirmed/)).toHaveCount(0);
  });

  test('is reachable from Train', async ({ page }) => {
    await page.goto('/train');
    await page.getByRole('link', { name: /Flexibility/ }).click();
    await expect(page).toHaveURL(/\/train\/flexibility$/);
  });
});

test.describe.serial('flexibility: four weeks, as people actually do them', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'phone',
      'One shared demo account runs one session at a time.',
    );
    test.setTimeout(120_000);
  });

  test('schedules three days and records a baseline', async ({ page }) => {
    await freshProgramme(page);
    await expect(page.getByText(/Sharp, radiating .* ends the session/).first()).toBeVisible();
    await expect(page.getByText(/not guaranteed to prevent injury/)).toBeVisible();

    // Three days, chosen.
    const days = page.getByRole('group', { name: 'Which three days suit you?' });
    for (const day of ['Mon', 'Wed', 'Fri']) {
      await expect(days.getByRole('checkbox', { name: day })).toBeChecked();
    }
    await page.getByRole('button', { name: 'Next: a quick baseline' }).click();

    const baseline = page.getByRole('form', { name: 'Baseline check-in' });
    await baseline.getByLabel(/how far do your hands reach/).selectOption('mid_shin');
    await baseline.getByLabel(/How tight/).selectOption('7');
    await expect(baseline.getByText(/does not store or analyse them/)).toBeVisible();
    await baseline.getByRole('button', { name: 'Save and start the programme' }).click();

    await expect(page.getByText('Week 1 of 4')).toBeVisible();
    for (const n of [1, 2, 3]) {
      await expect(page.getByRole('button', { name: `Start session ${n}` })).toBeVisible();
    }
  });

  test('completes a session out of order, behind a warm-up gate, and survives a reload', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/train/flexibility');

    // Session 3 first: any order within the week.
    await page.getByRole('button', { name: 'Start session 3' }).click();
    const player = page.getByTestId('flex-player');
    await expect(player).toBeVisible();

    // The gate: nothing until the warm-up is done. The no-jumping option swaps
    // the jog and high knees for a march.
    const go = page.getByRole('button', { name: /Warm-up done/ });
    await page
      .locator('label')
      .filter({ hasText: /^No jumping$/ })
      .click();
    await expect(go).toBeDisabled();
    await expect(player.getByText('Brisk march in place')).toBeVisible();
    await expect(player.getByText('Jog in place')).toHaveCount(0);
    for (const box of await player.getByRole('checkbox').all()) await box.check();
    await go.click();

    // First movement: per side, with a side selector, an intensity scale and
    // its text instruction.
    const movement = page.getByTestId('flex-movement');
    await expect(movement.getByRole('heading', { name: 'Hamstring kicks' })).toBeVisible();
    await expect(movement.getByRole('group', { name: 'Side' })).toBeVisible();
    // No animation for this one, so the text instruction is open by default.
    await expect(movement.getByText(/Stop if:/)).toBeVisible();
    await movement.getByLabel(/How strong is the stretch/).fill('9');
    await expect(movement.getByText(/more than this should feel/)).toBeVisible();
    await movement.getByLabel(/How strong is the stretch/).fill('4');
    await movement.getByRole('button', { name: 'Done 15 reps' }).click();
    await movement.getByRole('button', { name: 'Save the left side, then the other' }).click();
    await expect(movement.getByText(/Right side · Set 1 of 1/)).toBeVisible();
    await movement.getByRole('button', { name: 'Done 15 reps' }).click();
    await movement.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByText('Movement 2 of 3')).toBeVisible();

    // A reload lands on the next movement, not back at the warm-up.
    await page.reload();
    await expect(page.getByText('Movement 2 of 3')).toBeVisible();

    // The animated movement shows the player and the instructional-aid label.
    await expect(page.getByTestId('mannequin-player')).toBeVisible();
    await expect(page.getByText(/not an assessment of your form/)).toBeVisible();

    await doRemainingMovements(page);
    await page.getByLabel('Notes').fill('Left side tighter.');
    await page.getByRole('button', { name: 'Finish the session' }).click();
    await expect(page.getByTestId('flex-summary')).toHaveText(/Week 1, session 3 done/);
    await expect(page.getByTestId('flex-session-w1d3')).toContainText('Done');
    await expect(page.getByRole('button', { name: 'Start session 1' })).toBeVisible();
  });

  test('a missed session is skipped with a reason and the programme carries on', async ({
    page,
  }) => {
    await page.goto('/train/flexibility');
    await page.getByTestId('flex-session-w1d1').getByRole('button', { name: 'Skip' }).click();
    await page.getByLabel('What got in the way?').fill('Away for the weekend');
    await page.getByRole('button', { name: 'Skip it' }).click();
    await expect(page.getByTestId('flex-session-w1d1')).toContainText(
      'Skipped — Away for the weekend',
    );
    await expect(page.getByText('Week 1 of 4')).toBeVisible();
  });

  test('pain ends a session, is recorded, and leaves it open to try again gently', async ({
    page,
  }) => {
    await page.goto('/train/flexibility');
    await page.getByRole('button', { name: 'Start session 2' }).click();
    await page
      .locator('label')
      .filter({ hasText: /^Already warm$/ })
      .click();
    await page.getByRole('button', { name: /Warm-up done/ }).click();

    await page.getByRole('button', { name: /^Stop — sharp/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/see a physiotherapist or doctor/)).toBeVisible();
    await dialog.getByLabel(/Where and what kind of pain/).fill('Sharp behind the knee');
    await dialog.getByRole('button', { name: 'Stop the session' }).click();

    await expect(page.getByTestId('flex-summary')).toHaveText(/Stopped for pain/);
    await expect(page.getByTestId('flex-session-w1d2')).toContainText('Stopped for pain last time');

    // Trying again: the easier versions are on by default.
    await page.getByRole('button', { name: 'Start session 2' }).click();
    await expect(page.getByText(/Last time stopped for pain/)).toBeVisible();
  });

  test('finishes the week, moves on, and compares the week with the baseline', async ({ page }) => {
    await page.clock.install();
    await page.goto('/train/flexibility');
    const go = page.getByRole('button', { name: /Warm-up done/ });
    if (await go.isVisible()) {
      await page
        .locator('label')
        .filter({ hasText: /^Already warm$/ })
        .click();
      await go.click();
    }
    await expect(
      page
        .getByRole('switch', { name: /easier version/ })
        .or(page.getByRole('checkbox', { name: /easier version/ }))
        .first(),
    ).toBeChecked();
    await doRemainingMovements(page);
    await page.getByRole('button', { name: 'Finish the session' }).click();

    await expect(page.getByText('Week 2 of 4')).toBeVisible();
    const checkin = page.getByRole('form', { name: 'Week 1 check-in' });
    await checkin.getByLabel(/how far do your hands reach/).selectOption('ankles');
    await checkin.getByLabel(/How tight/).selectOption('5');
    await checkin.getByRole('button', { name: 'Save the check-in' }).click();

    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: /Forward fold reach/ })).toContainText('Mid-shin');
    await expect(table.getByRole('row', { name: /Forward fold reach/ })).toContainText('Ankles');
    await expect(table.getByRole('row', { name: /Forward fold reach/ })).toContainText('further');
    await expect(table.getByRole('row', { name: /Tightness/ })).toContainText('looser');
    await expect(page.getByText(/score/i).filter({ hasNotText: /No score/ })).toHaveCount(0);
  });
});
