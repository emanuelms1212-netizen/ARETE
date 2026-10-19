import { expect, test, type Page } from '@playwright/test';

/**
 * Food, end to end — the stage 10 acceptance criteria, in a browser: entries
 * persist and totals reconcile through add, edit and delete; a meal copies
 * from the day before; recipes calculate; targets show their working; a
 * self-set deficit is warned about; a safeguard changes the screen; units
 * switch; and the optional oil preference starts off and deletes whole.
 *
 * It edits the one shared demo account, so it runs in the phone project only
 * (D76) and every test puts back what it changed.
 */

async function total(page: Page, key: string): Promise<number> {
  const text = await page.getByTestId(`total-${key}`).locator('dd').first().innerText();
  return Number(text.replace(/[^\d.]/g, ''));
}

function meal(page: Page, name: string) {
  return page.getByRole('region', { name });
}

async function saveSettings(page: Page) {
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

test.describe.serial('food: logging, targets and safeguards', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'One shared demo account; edited in place.');
    test.setTimeout(90_000);
  });

  test('demo foods say their numbers are synthetic', async ({ page }) => {
    await page.goto('/train');
    await page.getByRole('link', { name: /^Food/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Food' })).toBeVisible();
    await page.getByRole('link', { name: 'Foods', exact: true }).click();
    const porridge = page.getByRole('listitem').filter({ hasText: 'Demo porridge' });
    await expect(
      porridge.getByText('Synthetic demo values — not real nutrition data'),
    ).toBeVisible();
  });

  test('totals reconcile through a quick add, an edit and a delete', async ({ page }) => {
    await page.goto('/train/food');
    const kcal = await total(page, 'kcal');
    const protein = await total(page, 'proteinG');
    const name = `E2E stew ${Date.now()}`;

    await page.getByRole('button', { name: 'Add to dinner' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Quick add', { exact: true }).click();
    await dialog.getByLabel('What was it?').fill(name);
    await dialog.getByLabel('Energy (kcal)').fill('250');
    await dialog.getByLabel('Protein (g)').fill('20');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(meal(page, 'Dinner').getByText(name)).toBeVisible();
    await expect.poll(() => total(page, 'kcal')).toBe(kcal + 250);
    await expect.poll(() => total(page, 'proteinG')).toBe(protein + 20);

    // Edit: the totals follow the new numbers.
    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('dialog').getByLabel('Energy (kcal)').fill('300');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => total(page, 'kcal')).toBe(kcal + 300);

    // A favourite, then its servings: a saved food's numbers scale.
    await page.getByRole('button', { name: 'Add to snacks' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Demo yoghurt/ })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => total(page, 'kcal')).toBe(kcal + 300 + 120);
    const yoghurt = meal(page, 'Snacks')
      .getByRole('button', { name: /^Edit Demo yoghurt/ })
      .last();
    await yoghurt.click();
    await page.getByRole('dialog').getByLabel('Servings').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => total(page, 'kcal')).toBe(kcal + 300 + 240);
    await yoghurt.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete entry' }).click();
    await expect.poll(() => total(page, 'kcal')).toBe(kcal + 300);

    // Delete: back to where it started, after a reload too.
    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete entry' }).click();
    await expect(page.getByText(name)).toHaveCount(0);
    await page.reload();
    await expect.poll(() => total(page, 'kcal')).toBe(kcal);
    await expect.poll(() => total(page, 'proteinG')).toBe(protein);
  });

  test("copies the day before's dinner", async ({ page }) => {
    const name = `E2E leftovers ${Date.now()}`;
    await page.goto('/train/food');
    await page.getByRole('link', { name: '← Day before' }).click();
    await expect(page.getByTestId('food-date')).not.toHaveText('Today');
    await page.getByRole('button', { name: 'Add to dinner' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Quick add', { exact: true }).click();
    await dialog.getByLabel('What was it?').fill(name);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(meal(page, 'Dinner').getByText(name)).toBeVisible();

    await page.getByRole('link', { name: 'Day after →' }).click();
    await expect(page.getByTestId('food-date')).toHaveText('Today');
    await meal(page, 'Dinner')
      .getByRole('button', { name: /Copy the day before.s dinner/ })
      .click();
    await expect(meal(page, 'Dinner').getByText(name)).toBeVisible();

    // Put it back: today's copied dinner, then the original.
    const edits = meal(page, 'Dinner').getByRole('button', { name: /^Edit / });
    for (let left = await edits.count(); left > 0; left -= 1) {
      await edits.first().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete entry' }).click();
      await expect(edits).toHaveCount(left - 1);
    }
    await page.getByRole('link', { name: '← Day before' }).click();
    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete entry' }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('a recipe is calculated from its ingredients', async ({ page }) => {
    await page.goto('/train/food?tab=foods');
    const name = `E2E recipe ${Date.now()}`;
    await page.getByRole('button', { name: 'New food' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Recipe', { exact: true }).click();
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Add ingredient' }).click();
    await dialog
      .getByLabel('Ingredient 1', { exact: true })
      .selectOption({ label: 'Demo porridge (1 bowl)' });
    await dialog.getByLabel('Servings', { exact: true }).fill('2');
    await dialog.getByLabel('The recipe makes (servings)').fill('4');
    await expect(dialog.getByTestId('recipe-preview')).toContainText('150 kcal');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const row = page
      .getByRole('listitem')
      .filter({ hasText: name })
      .filter({ hasText: 'Calculated from your recipe' });
    await expect(row.getByText('Calculated from your recipe')).toBeVisible();
    await row.getByRole('button', { name: `Remove ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove food' }).click();
    await expect(row).toHaveCount(0);
  });

  test('targets show their working, and a low self-set target is warned about', async ({
    page,
  }) => {
    await page.goto('/train/food?tab=settings');
    await page.getByText('Stay about the same').click();
    await page.getByLabel('Birth year').fill('1990');
    await page.getByLabel('Height (cm)').fill('170');
    await page.getByLabel('Weight (kg)').fill('70');
    await saveSettings(page);

    await expect(page.getByTestId('targets')).toContainText(/Energy\s*\d+–\d+ kcal/);
    await expect(page.getByTestId('targets')).toContainText(/Protein\s*85–110 g/);
    await page.getByText('How this was worked out').click();
    await expect(page.getByText(/Mifflin–St Jeor/)).toBeVisible();

    await page.getByLabel('Energy (kcal)').fill('1000');
    await expect(page.getByText(/Below 1200 kcal a day is very low/)).toBeVisible();
    await page.getByRole('button', { name: 'Save my targets' }).click();
    await expect(page.getByText('Set by you.', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Clear my targets' }).click();
    await expect(page.getByText(/Calculated from your settings/)).toBeVisible();
  });

  test('saying counting has not helped hides numbers and removes weight-loss targets', async ({
    page,
  }) => {
    await page.goto('/train/food?tab=settings');
    await expect(page.getByText('Lose weight gently')).toBeVisible();
    await page.getByText('Counting or weighing has not helped me').click();
    await saveSettings(page);

    await expect(
      page.getByRole('heading', { name: 'Numbers stay in the background' }),
    ).toBeVisible();
    await expect(page.getByText('Lose weight gently')).toHaveCount(0);
    await expect(page.getByText('Show a weight trend')).toHaveCount(0);
    await expect(page.getByText('Numbers are hidden, as you chose.')).toBeVisible();

    await page.getByRole('link', { name: 'Day', exact: true }).click();
    await expect(page.getByText(/Numbers are hidden, as you chose/)).toBeVisible();
    await expect(page.getByTestId('total-kcal')).toHaveCount(0);
    await expect(page.getByText(/\d+ kcal/)).toHaveCount(0);

    // Put it back.
    await page.goto('/train/food?tab=settings');
    await page.getByText('Counting or weighing has not helped me').click();
    await page.getByText('Hide all numbers').click();
    await saveSettings(page);
    await page.goto('/train/food');
    await expect(page.getByTestId('total-kcal')).toBeVisible();
  });

  test('US units change the water buttons and the fields', async ({ page }) => {
    await page.goto('/train/food?tab=settings');
    await page.getByText('US', { exact: true }).click();
    await saveSettings(page);
    await expect(page.getByLabel('Height (ft)')).toHaveValue('5');
    await expect(page.getByLabel('Weight (lb)')).toHaveValue('154.3');

    await page.goto('/train/food');
    await expect(page.getByRole('button', { name: '+ 8 fl oz' })).toBeVisible();

    await page.goto('/train/food?tab=settings');
    await page.getByText('Metric', { exact: true }).click();
    await saveSettings(page);
    await expect(page.getByLabel('Height (cm)')).toHaveValue('170');
    await expect(page.getByLabel('Weight (kg)')).toHaveValue('70');
  });

  test('the weight trend is off until asked for, and can be hidden again', async ({ page }) => {
    await page.goto('/train/food?tab=settings');
    await expect(page.getByRole('heading', { name: 'Weight trend' })).toHaveCount(0);
    await page.getByText('Show a weight trend').click();
    await page.getByLabel('Weight (kg)').fill('71');
    await saveSettings(page);
    await expect(page.getByRole('heading', { name: 'Weight trend' })).toBeVisible();
    await expect(page.getByText(/average 71 kg \(weighed 71 kg\)/)).toBeVisible();
    await page.getByText('Show a weight trend').click();
    await page.getByLabel('Weight (kg)').fill('70');
    await saveSettings(page);
    await expect(page.getByRole('heading', { name: 'Weight trend' })).toHaveCount(0);
  });

  test('ingredient awareness starts off, and turning it off deletes its data', async ({ page }) => {
    await page.goto('/train/food?tab=settings');
    await page.getByRole('button', { name: 'Turn on ingredient awareness' }).click();
    await expect(page.getByText(/One author’s viewpoint/)).toBeVisible();
    await expect(page.getByText(/does not recommend vitamin E, NAC/)).toBeVisible();

    await page.getByLabel('Ingredient', { exact: true }).fill('sunflower oil');
    await page.getByText('Avoid', { exact: true }).click();
    await page.getByRole('button', { name: 'Add to list' }).click();
    await expect(page.getByText('sunflower oil · Avoid')).toBeVisible();

    await page.goto('/train/food?tab=foods');
    await page.getByRole('button', { name: 'Edit Demo porridge' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/Ingredients from the label/)
      .fill('Oats, sunflower oil');
    await expect(page.getByRole('dialog').getByText(/sunflower oil \(avoid\)/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Label mentions: sunflower oil (avoid)')).toBeVisible();

    await page.goto('/train/food?tab=settings');
    await page.getByRole('button', { name: 'Turn off and delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Turn off and delete' }).click();
    await expect(page.getByRole('button', { name: 'Turn on ingredient awareness' })).toBeVisible();

    await page.goto('/train/food?tab=foods');
    await expect(page.getByText(/Label mentions/)).toHaveCount(0);
  });
});

test.describe('food: layout', () => {
  for (const tab of ['day', 'week', 'foods', 'settings']) {
    test(`the ${tab} view fits the screen without sideways scrolling`, async ({ page }) => {
      await page.goto(`/train/food?tab=${tab}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Food' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
