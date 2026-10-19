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

    const search = page.getByRole('searchbox', { name: 'Search destinations' });

    // The shortcut only works once the launcher has hydrated, and nothing on the
    // page announces that moment. Press until it takes rather than racing it.
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(search).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });

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

test.describe.serial('motion', () => {
  test.use({ reducedMotion: 'reduce' });

  /**
   * Reduced motion is not a degraded version of the orb.
   *
   * The orb stops scaling, and everything that paces the breath — the phase
   * name, the count, the round — keeps working. Someone who has turned motion
   * off still needs to know when to breathe out.
   */
  test('the breathing orb rests still, and still paces the breath', async ({ page }) => {
    await page.goto('/mind');

    const stop = page.getByRole('button', { name: 'Stop here' });
    if (await stop.isVisible()) {
      await stop.click();
      const skip = page.getByRole('button', { name: 'Skip' });
      if (await skip.isVisible()) await skip.click();
    }

    await expect(async () => {
      await page
        .locator('label')
        .filter({ hasText: /^Breathe$/ })
        .first()
        .click();
      await expect(page.getByRole('radio', { name: 'Breathe' })).toBeChecked({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    await page.getByRole('button', { name: /Box breathing/ }).click();
    await page.getByRole('button', { name: /^Begin \d+ rounds$/ }).click();

    // The cue is there and it names a phase.
    await expect(page.getByText(/Breathe in|Hold|Breathe out|Rest/).first()).toBeVisible();
    // The visible caption, not the live region — both carry the round, by
    // design, so this asks for the one a sighted user reads.
    await expect(page.getByText(/^Round \d+ of \d+$/)).toBeVisible();

    // And the orb is not animating: its size is fixed rather than transitioning.
    const transition = await page
      .locator('div.rounded-full.bg-accent-soft')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionProperty);
    expect(transition === 'none' || transition === 'all').toBe(true);

    await page.getByRole('button', { name: 'Stop here' }).click();
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible()) await skip.click();
  });
});

test.describe('styleguide', () => {
  test('is not reachable in a production build', async ({ page }) => {
    const response = await page.goto('/styleguide');
    expect(response?.status()).toBe(404);
  });
});

test.describe('onboarding', () => {
  // Demo mode keeps its state in the server process, so these run in order and
  // the one that finishes the flow runs last.
  test.describe.configure({ mode: 'serial' });

  test('sends you to wherever you got to', async ({ page }) => {
    await page.goto('/onboarding');
    // Either the first step, or the review if this browser already finished.
    await expect(page).toHaveURL(
      /\/onboarding\/(intent|schedule|training|health|food|mind|age|minimum|review)$/,
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('says why it is asking, on the step that matters most', async ({ page }) => {
    await page.goto('/onboarding/health');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /Anything ARETE should not suggest/i,
    );
    await expect(
      page.getByText(/none of this is a diagnosis and none of it is shared/i),
    ).toBeVisible();
  });

  test('shows progress and can always be left', async ({ page }) => {
    await page.goto('/onboarding/training');

    await expect(page.getByRole('progressbar', { name: 'Onboarding progress' })).toBeVisible();
    await page.getByRole('link', { name: 'Do this later' }).click();
    await expect(page).toHaveURL(/\/today$/);
  });

  test('every step can be skipped', async ({ page }) => {
    await page.goto('/onboarding/food');
    await page.getByRole('button', { name: 'Skip this' }).click();
    await expect(page).toHaveURL(/\/onboarding\/mind$/);
  });

  test('offers only the packs you tick, and says so', async ({ page }) => {
    await page.goto('/onboarding/mind');
    await expect(page.getByText(/Nothing here is ever added for you/i)).toBeVisible();
  });

  test('warns a minor that no calorie target will be generated', async ({ page }) => {
    await page.goto('/onboarding/age');

    await page.getByLabel('Year of birth').fill('2012');
    await expect(page.getByText(/will not generate calorie targets/i)).toBeVisible();
    await expect(page.getByLabel(/parent, guardian or clinician has agreed/i)).toBeVisible();
  });

  test('completes the flow and writes the week', async ({ page }) => {
    await page.goto('/onboarding/minimum');
    await page.getByRole('button', { name: 'See my first week' }).click();

    await expect(page).toHaveURL(/\/onboarding\/review$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Nothing is saved yet/i);

    // Seven days, each a titled section.
    await expect(page.getByText(/At a glance/i)).toBeVisible();
    await expect(page.getByText(/deliberately lighter/i)).toBeVisible();

    // Every item can explain itself.
    const why = page.getByRole('button', { name: 'Why is this here?' }).first();
    await why.click();
    await expect(page.getByRole('button', { name: 'Hide why' }).first()).toBeVisible();

    // And can be removed before anything is saved.
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByRole('button', { name: 'Put back' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Save this week' }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByText('Minimum day')).toBeVisible();
  });
});

/**
 * The day loop.
 *
 * Demo mode is writable in memory, so these exercise the real actions against
 * the real repository contract — not a mocked one. They run in series because
 * they share the one demo account.
 */
test.describe.serial('the day loop', () => {
  /**
   * Each test creates the item it acts on.
   *
   * These originally acted on seeded titles, which passed alone and failed in
   * the suite: the onboarding tests accept a plan, which gives the demo
   * account a real day and retires the sample one. A test that depends on
   * another test's leftovers is a test that reports the wrong thing.
   */
  /**
   * Adds an item whose title is unique to this run.
   *
   * The phone and desktop projects share one server, and demo mode keeps its
   * data in that server's memory — so a fixed title appears twice and every
   * assertion about it becomes ambiguous. The suffix is what keeps the two
   * projects from reading each other's rows.
   */
  async function addItem(page: import('@playwright/test').Page, label: string) {
    const title = `${label} ${test.info().project.name}-${Date.now().toString(36).slice(-5)}`;
    await page.goto('/today');
    await page.getByRole('button', { name: 'Add something' }).click();
    await page.getByLabel('What else?').fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    return title;
  }

  test('quick-adds something, and it is still there after a reload', async ({ page }) => {
    const title = await addItem(page, 'Call the bank');

    await page.reload();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });

  test('completes a commitment and keeps it completed across a reload', async ({ page }) => {
    const title = await addItem(page, 'Water the plants');

    const row = page.getByRole('listitem').filter({ hasText: title });
    await row.getByRole('button', { name: `Mark ${title} done` }).click();
    await expect(row.getByRole('button', { name: /not done/ })).toBeVisible();

    await page.reload();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('button', { name: /not done/ }),
    ).toBeVisible();
  });

  test('a skip asks for a reason and records it', async ({ page }) => {
    const title = await addItem(page, 'Long run');
    const reason = `Hip was sore ${test.info().project.name}`;

    await page
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Skip' })
      .click();

    await expect(page.getByText(/a skip is not a miss/i)).toBeVisible();
    await page.getByLabel('What got in the way?').fill(reason);
    await page.getByRole('button', { name: 'Skip it' }).click();

    const row = page.getByRole('listitem').filter({ hasText: title });
    await expect(row).toContainText(reason);
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText(reason);
  });

  test('moves a commitment to tomorrow and says so rather than hiding it', async ({ page }) => {
    const title = await addItem(page, 'Renew the passport');

    const row = page.getByRole('listitem').filter({ hasText: title });
    await row.getByRole('button', { name: 'Tomorrow' }).click();

    // "I moved this" has to read differently from "this vanished".
    await expect(row).toContainText(/moved to tomorrow/i);
  });

  test('sets an intention and the dichotomy-of-control prompt', async ({ page }) => {
    await page.goto('/today');

    await page.getByRole('button', { name: /set an intention|change/i }).click();
    const intention = `Finish the section ${test.info().project.name}`;
    const release = `Whether it lands well ${test.info().project.name}`;
    await page.getByLabel('What is today for?').fill(intention);
    await page.getByLabel('Mine to do').fill('Starting before email');
    await page.getByLabel('Not mine').fill(release);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText(intention, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(release, { exact: true })).toBeVisible();
  });

  test('running the day at its minimum never marks it failed', async ({ page }) => {
    await page.goto('/today');

    // The checkbox itself is `sr-only` — the visible control is its label, and
    // clicking the label is what a person actually does.
    const minimumToggle = page.getByLabel('Run today at its minimum');
    await page.getByText('Run today at its minimum').click();
    await expect(minimumToggle).toBeChecked();
    await expect(page.getByText(/running at the minimum/i)).toBeVisible();

    // The decisive assertion: turning the day down is a success state.
    await expect(page.getByText(/failed|you missed|incomplete day/i)).toHaveCount(0);

    await page.getByText('Run today at its minimum').click();
    await expect(minimumToggle).not.toBeChecked();
  });

  test('writes the evening review and reads it back', async ({ page }) => {
    await page.goto('/today');

    // Two things make this fiddly: the form stays open once a review exists
    // (the two projects share one demo account), and the opening button does
    // nothing until the component has hydrated. Press until the form is there.
    await expect(async () => {
      const opener = page.getByRole('button', { name: 'Write the review' });
      if ((await opener.count()) > 0) await opener.click();
      await expect(page.getByLabel('What went well?')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    const note = `Started early ${test.info().project.name}`;
    await page.getByLabel('What went well?').fill(note);
    await page.getByLabel('One thing for tomorrow').fill('Finish the draft');
    // "Save" the first time, "Update" once a review exists for the day.
    await page.getByRole('button', { name: /(save|update) the review/i }).click();

    // Wait for the write to be acknowledged rather than racing the reload
    // against it — a reload mid-transition cancels the request.
    await expect(page.getByText('Review saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('What went well?')).toHaveValue(note);
  });
});

/**
 * The Plan screen.
 *
 * The goal assertions are the ones worth having: a goal with no number must
 * not acquire a progress bar, and a limit habit must not be rendered as a
 * target. Both are easy to regress and invisible in a type check.
 */
test.describe('plan', () => {
  async function openTab(page: import('@playwright/test').Page, tab: string) {
    await page.goto('/plan');
    await expect(async () => {
      await page
        .locator('label')
        .filter({ hasText: new RegExp(`^${tab}$`) })
        .first()
        .click();
      await expect(page.getByRole('radio', { name: tab })).toBeChecked({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  }

  test('shows the three planning surfaces', async ({ page }) => {
    await page.goto('/plan');

    for (const tab of ['Tasks', 'Habits', 'Goals']) {
      await expect(page.getByRole('radio', { name: tab })).toBeAttached();
    }
  });

  test('separates the inbox from today', async ({ page }) => {
    await openTab(page, 'Tasks');

    // Seeded with no date: captured, not scheduled.
    await expect(page.getByText('Work out what the dentist actually said')).toBeVisible();

    await page
      .locator('label')
      .filter({ hasText: /^Today$/ })
      .first()
      .click();
    await expect(page.getByText('Work out what the dentist actually said')).toHaveCount(0);
  });

  test('nests a subtask under its parent rather than beside it', async ({ page }) => {
    await openTab(page, 'Tasks');
    await page
      .locator('label')
      .filter({ hasText: /^Today$/ })
      .first()
      .click();

    const parent = page.getByRole('listitem').filter({ hasText: 'Draft the quarterly note' });
    await expect(parent.first()).toContainText('Pull the numbers');
  });

  test('gives a measured goal a progress bar', async ({ page }) => {
    await openTab(page, 'Goals');

    await expect(
      page.getByRole('progressbar', { name: /Run 10k without stopping/i }),
    ).toBeVisible();
  });

  test('refuses to invent a percentage for a goal with no number', async ({ page }) => {
    await openTab(page, 'Goals');

    // Two milestones, one of them done — the tempting wrong answer is "50%".
    await expect(page.getByText(/judged at review, not by a number/i)).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: /Be someone my sister can call/i }),
    ).toHaveCount(0);
  });

  test('describes a limit habit as a ceiling, not a target', async ({ page }) => {
    await openTab(page, 'Habits');

    await expect(page.getByText(/stay under 2 cups/i)).toBeVisible();
  });

  test('reports consistency rather than only a streak', async ({ page }) => {
    // Creates its own habit: the seeded ones sit on the demo account's fixed
    // sample date, which retires as soon as another test accepts a real plan.
    // Unique per run as well as per project: against a long-lived server the
    // previous run's habit is still there, and two identical titles are ambiguous.
    const title = `Drink water ${test.info().project.name}-${Date.now().toString(36).slice(-5)}`;
    await openTab(page, 'Habits');

    await page.getByRole('button', { name: 'Add a habit' }).click();
    await page.getByLabel('The habit').fill(title);
    await page.getByRole('button', { name: 'Add it' }).click();

    // A brand-new habit has no history, and says so rather than showing 0%.
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText('Nothing scheduled yet.').first()).toBeVisible();

    // Log it once and the rate appears, with a real day behind it.
    await page.getByRole('button', { name: `Mark ${title} done` }).click();
    await expect(page.getByText(/% of scheduled days/).first()).toBeVisible();
  });
});

/**
 * The focus timer.
 *
 * The acceptance criterion for this stage is that a refresh does not lose the
 * timer, so that is the first test. The second is the one that catches the
 * other tempting shortcut: if paused time were still counted, a session paused
 * overnight would report a heroic number in the morning.
 */
test.describe.serial('the focus timer', () => {
  const elapsed = (page: import('@playwright/test').Page) => page.getByText(/of focus/);

  /** Leaves exactly one running, unpaused session, whatever state we inherit. */
  async function ensureRunning(page: import('@playwright/test').Page) {
    await page.goto('/today');

    await expect(async () => {
      const resume = page.getByRole('button', { name: 'Resume' });
      if (await resume.isVisible()) await resume.click();

      const startButton = page.getByRole('button', { name: /^Start \d+ minutes$/ });
      if (await startButton.isVisible()) await startButton.click();

      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
  }

  test('survives a reload with its elapsed time intact', async ({ page }) => {
    await ensureRunning(page);
    await expect(elapsed(page)).toBeVisible();

    await page.waitForTimeout(2000);
    await page.reload();

    // The session is restored on the server before the page even hydrates.
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(elapsed(page)).toContainText(/0:\d\d/);
  });

  test('does not count paused time as focus', async ({ page }) => {
    await ensureRunning(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

    const frozen = await elapsed(page).innerText();
    await page.waitForTimeout(3000);
    expect(await elapsed(page).innerText()).toBe(frozen);

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('counts a pause as an interruption rather than hiding it', async ({ page }) => {
    await ensureRunning(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(elapsed(page)).toContainText(/pause/);
  });

  test('finishing returns the timer to its starting state', async ({ page }) => {
    await ensureRunning(page);
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page.getByRole('button', { name: /^Start \d+ minutes$/ })).toBeVisible();
  });
});

/**
 * The stage's own acceptance criterion, as one journey.
 *
 * The brief asks for exactly this: a new user can plan tomorrow, complete
 * today, run a focus session, refresh without losing timer state, and see the
 * result linked to the correct task. Each half is covered by a narrower test
 * above; this one proves they compose, which is the part that quietly breaks.
 */
test.describe.serial('the full loop', () => {
  test('plan tomorrow, complete today, focus, refresh, and see the link', async ({ page }) => {
    const stamp = `${test.info().project.name}-${Date.now().toString(36).slice(-5)}`;
    const tomorrowTask = `Draft the agenda ${stamp}`;
    const todayThing = `Clear the desk ${stamp}`;

    // 1. Plan tomorrow: capture a task, then schedule it off the inbox.
    await page.goto('/plan');
    await page.getByLabel('Add a task').fill(tomorrowTask);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(tomorrowTask, { exact: true })).toBeVisible();

    await page
      .getByRole('listitem')
      .filter({ hasText: tomorrowTask })
      .getByRole('button', { name: 'Tomorrow' })
      .click();

    await page
      .locator('label')
      .filter({ hasText: /^Upcoming$/ })
      .first()
      .click();
    await expect(page.getByText(tomorrowTask, { exact: true })).toBeVisible();

    // 2. Complete something today.
    await page.goto('/today');
    await page.getByRole('button', { name: 'Add something' }).click();
    await page.getByLabel('What else?').fill(todayThing);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const row = page.getByRole('listitem').filter({ hasText: todayThing });
    await row.getByRole('button', { name: `Mark ${todayThing} done` }).click();
    await expect(row.getByRole('button', { name: /not done/ })).toBeVisible();

    // 3. Run a focus session, linked to a task.
    const finish = page.getByRole('button', { name: 'Finish' });
    if (await finish.isVisible()) await finish.click();

    const picker = page.getByLabel('On what?');
    if (await picker.isVisible()) await picker.selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Start \d+ minutes$/ }).click();
    await expect(page.getByText(/of focus/)).toBeVisible();

    // 4. Refresh without losing it.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // 5. The completion survived the reload too.
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: todayThing })
        .getByRole('button', { name: /not done/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('button', { name: /^Start \d+ minutes$/ })).toBeVisible();
  });
});

/**
 * Mind: meditation, breathwork and cognitive practice.
 *
 * Three of these are compliance assertions rather than feature tests — the
 * religious pack staying invisible, the absence of any outcome claim, and the
 * breathwork safety copy being on the screen where the decision is made. They
 * are the acceptance criteria this stage is actually judged on.
 */
test.describe.serial('mind', () => {
  async function toMode(page: import('@playwright/test').Page, label: string) {
    await page.goto('/mind');
    // Leave any session a previous test left running.
    const stop = page.getByRole('button', { name: 'Stop here' });
    if (await stop.isVisible()) {
      await stop.click();
      const skip = page.getByRole('button', { name: 'Skip' });
      if (await skip.isVisible()) await skip.click();
    }
    await expect(async () => {
      await page
        .locator('label')
        .filter({ hasText: new RegExp(`^${label}$`) })
        .first()
        .click();
      await expect(page.getByRole('radio', { name: label })).toBeChecked({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  }

  test('offers the secular practices to anyone', async ({ page }) => {
    await toMode(page, 'Meditate');

    await expect(page.getByText('Breath awareness')).toBeVisible();
    await expect(page.getByText('Loving-kindness')).toBeVisible();
  });

  test('keeps the religious pack invisible until it is chosen', async ({ page }) => {
    await toMode(page, 'Meditate');

    // The pack is offered neutrally in a list of packs...
    await expect(page.getByText('Jewish meditation — four weeks')).toBeVisible();
    // ...but none of its practices exist until it is picked.
    await expect(page.getByText(/week one — breath and stillness/i)).toHaveCount(0);
    await expect(page.getByText(/hitbodedut/i)).toHaveCount(0);
  });

  test('shows the pack’s practices once chosen, and hides them again when not', async ({
    page,
  }) => {
    await toMode(page, 'Meditate');

    await page.getByText('Jewish meditation — four weeks').click();
    await expect(page.getByText(/week one — breath and stillness/i)).toBeVisible();

    await page.getByText('Jewish meditation — four weeks').click();
    await expect(page.getByText(/week one — breath and stillness/i)).toHaveCount(0);
  });

  test('puts the breathwork safety notice where the decision is made', async ({ page }) => {
    await toMode(page, 'Breathe');
    await page.getByRole('button', { name: /Box breathing/ }).click();

    // Not behind a link, not after the session.
    await expect(page.getByText(/stop if you feel dizzy/i)).toBeVisible();
    await expect(page.getByText(/never practise in or near water/i)).toBeVisible();
  });

  test('a breathing session survives a reload', async ({ page }) => {
    await toMode(page, 'Breathe');
    await page.getByRole('button', { name: /Calm breathing/ }).click();
    await page.getByRole('button', { name: /^Begin \d+ rounds$/ }).click();
    await expect(page.getByText(/so far/)).toBeVisible();

    await page.waitForTimeout(1500);
    await page.reload();

    // Back inside the session, on the right mode, with the time intact.
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByText(/so far/)).toBeVisible();

    await page.getByRole('button', { name: 'Stop here' }).click();
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible()) await skip.click();
  });

  test('states the transfer limit before offering a drill', async ({ page }) => {
    await toMode(page, 'Practise');

    await expect(page.getByText(/not a measure of intelligence/i)).toBeVisible();
    await expect(page.getByText(/not evidence of improvement at anything else/i)).toBeVisible();
  });

  test('makes no unqualified outcome claim anywhere on the Mind screen', async ({ page }) => {
    for (const mode of ['Meditate', 'Breathe', 'Practise']) {
      await toMode(page, mode);
      const text = (await page.locator('main').innerText()).toLowerCase();

      // The claims this product does not make, in any mode.
      expect(text, mode).not.toMatch(
        /\biq\b|percentile|brain age|cures?\b|treats?\b|heals?\b|detox|boosts? your|guarantee/,
      );
    }
  });
});
