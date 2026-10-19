import { expect, test, type Page } from '@playwright/test';

/**
 * Train, end to end.
 *
 * The demo account is one shared, in-memory account, and only one workout may
 * run at a time. The tests that start, log and finish a workout therefore run
 * in the phone project only — two projects driving one account's single
 * running workout would be testing the race, not the feature. Everything that
 * only reads (the plan, the library, the player) runs in both.
 */

async function leaveAnyRunningWorkout(page: Page) {
  await page.goto('/train');
  const stop = page.getByRole('button', { name: 'Stop here' });
  if (await stop.isVisible()) {
    await stop.click();
    await page.getByRole('button', { name: 'Stop and save' }).click();
    await expect(page.getByTestId('workout-summary')).toBeVisible();
  }
}

test.describe('train: the plan', () => {
  test('shows the week, today, and why the plan is what it is', async ({ page }) => {
    await page.goto('/train');
    await expect(page.getByRole('heading', { level: 1, name: 'Train' })).toBeVisible();
    const week = page.getByRole('list').filter({ hasText: /^Monday/ });
    for (const day of [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]) {
      await expect(week.getByText(new RegExp(`^${day}`)).first()).toBeVisible();
    }
    await expect(page.getByText('Why this plan')).toBeVisible();
    await expect(page.getByText(/Each session has a minimum version/)).toBeVisible();
    await expect(
      page.getByText(/Load goes up only when every set reaches the top of its range/),
    ).toBeVisible();
  });

  test('explains each target with the rule that produced it', async ({ page }) => {
    await page.goto('/train');
    // Either today's preview or, on a rest day, nothing — but the demo history
    // always yields at least one stated progression rule somewhere on a
    // training day, so check the rule copy is the engine's, not a placeholder.
    const rules = page.getByText(
      /(load goes up|aim for \d+ reps|holds steady|First time|Same again)/i,
    );
    const restDay = page.getByText(/rest day|Tennis today/i);
    await expect(rules.or(restDay).first()).toBeVisible();
  });
});

test.describe('train: the exercise library', () => {
  test('lists exercises by movement and opens one with a full text fallback', async ({ page }) => {
    await page.goto('/train/exercises');
    await expect(page.getByRole('heading', { level: 1, name: 'Exercise library' })).toBeVisible();
    await page.getByRole('link', { name: /Dead bug/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dead bug' })).toBeVisible();
    // No animation for this one, and it says so rather than leaving a gap.
    await expect(
      page.getByText('No animation for this one. The steps below are the instruction.'),
    ).toBeVisible();
    for (const heading of ['How to do it', 'Cues', 'Common mistakes', 'Stop if']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('labels the animation as an instructional aid, not a form assessment', async ({ page }) => {
    await page.goto('/train/exercises/push-up');
    await expect(page.getByText(/An instructional aid\./)).toBeVisible();
    await expect(page.getByText(/not an assessment of your form/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stop if' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Common mistakes' })).toBeVisible();
  });

  test('every one of the nine animations renders a figure', async ({ page }) => {
    for (const slug of [
      'bodyweight-squat',
      'push-up',
      'split-squat',
      'plank',
      'glute-bridge',
      'single-leg-rdl',
      'good-morning',
      'leg-swing',
      'elephant-walk',
    ]) {
      await page.goto(`/train/exercises/${slug}`);
      const figure = page.getByTestId('mannequin-player').getByRole('img');
      await expect(figure, slug).toBeVisible();
      await expect(figure.locator('line[data-segment]'), slug).toHaveCount(12);
    }
  });
});

test.describe('train: the player', () => {
  test('plays, pauses, scrubs, changes speed and view, and captions each step', async ({
    page,
  }) => {
    await page.goto('/train/exercises/bodyweight-squat');
    const player = page.getByTestId('mannequin-player');
    const thigh = player.locator('line[data-segment="nearThigh"]');
    const caption = page.getByTestId('mannequin-caption');

    await expect(caption).toHaveText(/Feet about hip-width/);
    const before = await thigh.getAttribute('x2');

    await expect(async () => {
      await player.getByRole('button', { name: 'Play' }).click();
      await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await page.waitForTimeout(700);
    await player.getByRole('button', { name: 'Pause' }).click();
    expect(await thigh.getAttribute('x2')).not.toBe(before);

    // Scrubbing to the bottom of the squat shows the bottom of the squat.
    await player.getByLabel('Position in the movement').fill('500');
    await expect(caption).toHaveText(/Heels stay down/);

    await player
      .locator('label')
      .filter({ hasText: /^0\.5×$/ })
      .click();
    await expect(player.getByRole('radio', { name: '0.5×' })).toBeChecked();

    await player
      .locator('label')
      .filter({ hasText: /^Front$/ })
      .click();
    await expect(player.getByRole('img', { name: /front view/ })).toBeVisible();

    await player.getByRole('button', { name: 'Restart' }).click();
    await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('shows a still, captioned sequence instead of motion when motion is reduced', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/train/exercises/bodyweight-squat');
    const stills = page.getByRole('list', { name: /step by step/ });
    await expect(stills).toBeVisible();
    await expect(stills.getByRole('listitem')).toHaveCount(4);
    await expect(stills.getByRole('img', { name: /^Step 1:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
  });

  test('animates smoothly with the CPU slowed to a mid-range phone', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'phone',
      'CPU throttling is a Chromium, phone-project check',
    );
    await page.goto('/train/exercises/elephant-walk');
    const session = await page.context().newCDPSession(page);
    // 4× slower than this machine: the usual stand-in for a mid-range phone.
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const player = page.getByTestId('mannequin-player');
    await expect(async () => {
      await player.getByRole('button', { name: 'Play' }).click();
      await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });

    const stats = await page.evaluate(
      () =>
        new Promise<{ frames: number; changes: number; p95: number }>((resolve) => {
          const line = document.querySelector('line[data-segment="nearShin"]');
          const gaps: number[] = [];
          let changes = 0;
          let last = performance.now();
          let previous = line?.getAttribute('x2') ?? '';
          const started = last;
          const tick = (now: number) => {
            gaps.push(now - last);
            last = now;
            const current = line?.getAttribute('x2') ?? '';
            if (current !== previous) changes += 1;
            previous = current;
            if (now - started < 2000) requestAnimationFrame(tick);
            else {
              gaps.sort((a, b) => a - b);
              resolve({
                frames: gaps.length,
                changes,
                p95: gaps[Math.floor(gaps.length * 0.95)] ?? 999,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    testInfo.annotations.push({ type: 'animation', description: JSON.stringify(stats) });
    // About 60 frames a second, the figure moving on nearly every one, and no
    // frame that took long enough to read as a stutter.
    expect(stats.frames).toBeGreaterThan(90);
    expect(stats.changes).toBeGreaterThan(stats.frames * 0.8);
    expect(stats.p95).toBeLessThan(34);
  });
});

test.describe.serial('train: a workout, start to finish', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'phone',
      'One shared demo account can run one workout at a time.',
    );
  });

  test('starts, logs, survives a reload, swaps, and finishes', async ({ page }) => {
    await leaveAnyRunningWorkout(page);

    // Today's session, or — on a rest day — any session from the week.
    const pick = page
      .getByRole('button', { name: /^Full body|^Upper|^Lower|^Conditioning|^Easy/ })
      .first();
    const startToday = page.getByRole('button', { name: /^Start / });
    await expect(startToday.or(pick).first()).toBeVisible();
    if (!(await startToday.isVisible())) await pick.click();
    await page
      .locator('label')
      .filter({ hasText: /^Normal$/ })
      .click();
    await expect(async () => {
      if (await startToday.isVisible()) await startToday.click();
      await expect(page.getByTestId('workout-runner')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });

    const runner = page.getByTestId('workout-runner');
    await expect(runner.getByText('In progress')).toBeVisible();

    // A warm-up is one tap.
    await runner
      .getByRole('button', { name: /^Mark .* done$/ })
      .first()
      .click();
    await expect(runner.getByText(/Set 1:/).first()).toBeVisible();

    // A main-work set: reps or time, effort, pain, form.
    const firstSet = runner.getByRole('form', { name: /, set 1$/ }).first();
    await firstSet.getByLabel('Effort (RPE)').selectOption('7');
    await firstSet.getByLabel('Pain (0–10)').selectOption('5');
    await expect(firstSet.getByRole('alert')).toHaveText(/then stop this exercise/);
    await firstSet.getByLabel('Pain (0–10)').selectOption('0');
    await firstSet.getByRole('button', { name: 'Log set 1' }).click();
    await expect(runner.getByText(/RPE 7/).first()).toBeVisible();

    // Rest is offered, derived from the set just logged, and can be skipped.
    const rest = page.getByRole('timer', { name: 'Rest' });
    await expect(rest).toBeVisible();
    await rest.getByRole('button', { name: 'Skip rest' }).click();
    await expect(rest).toHaveCount(0);

    // Everything logged is still there after a reload.
    const logged = await runner.getByText(/Set \d:/).count();
    await page.reload();
    await expect(page.getByTestId('workout-runner')).toBeVisible();
    await expect(page.getByTestId('workout-runner').getByText(/Set \d:/)).toHaveCount(logged);

    // Swap an exercise nothing has been logged for. The pattern is kept.
    const swap = page.getByRole('button', { name: 'Swap for something similar' }).last();
    await swap.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/trains the same movement/)).toBeVisible();
    const option = dialog.getByRole('listitem').first().getByRole('button');
    const chosen = (await option.textContent())?.trim() ?? '';
    await option.click();
    await expect(
      page.getByTestId('workout-runner').getByRole('heading', { name: chosen }),
    ).toBeVisible();
    await expect(page.getByText(/Swapped in for/).first()).toBeVisible();

    // The how-to opens over the workout without losing it.
    await page.getByRole('button', { name: 'How to' }).first().click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'How to do it' }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Finish workout' }).click();
    await page.getByLabel('Notes for next time').fill('E2E: knees felt fine.');
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect(page.getByTestId('workout-summary')).toHaveText(/sets? logged/);

    // And it is in the history once the page is reloaded.
    await page.reload();
    await expect(page.getByTestId('workout-runner')).toHaveCount(0);
    await expect(page.getByText('Recent workouts')).toBeVisible();
  });

  test('changes the setup and the plan follows it', async ({ page }) => {
    await leaveAnyRunningWorkout(page);
    await page.getByRole('button', { name: 'Edit setup' }).click();
    const minutes = page.getByLabel('Minutes per session');
    const original = await minutes.inputValue();

    await minutes.fill('20');
    await page.getByRole('button', { name: 'Save and update the plan' }).click();
    await expect(page.getByText(/planned to fit in 20 minutes|20 minutes is tight/)).toBeVisible();

    // Put it back, so the rest of the suite sees the demo as seeded.
    await page.getByRole('button', { name: 'Edit setup' }).click();
    await page.getByLabel('Minutes per session').fill(original);
    await page.getByRole('button', { name: 'Save and update the plan' }).click();
    await expect(page.getByText(new RegExp(`planned to fit in ${original} minutes`))).toBeVisible();
  });

  test('refuses a setup with one training day, and says why', async ({ page }) => {
    await page.goto('/train');
    await page.getByRole('button', { name: 'Edit setup' }).click();
    const days = page.getByRole('group', { name: /Which days can you train/ });
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      if (await days.getByRole('checkbox', { name: day }).isChecked()) {
        await days
          .locator('label')
          .filter({ hasText: new RegExp(`^${day}$`) })
          .click();
      }
    }
    await days.locator('label').filter({ hasText: /^Mon$/ }).click();
    await page.getByRole('button', { name: 'Save and update the plan' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Pick at least two days.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
