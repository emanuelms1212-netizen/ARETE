import { expect, test } from '@playwright/test';

test.describe('safety and privacy settings', () => {
  test('the safety overview names every gated module with a reason', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('link', { name: 'Safety and modules' }).click();
    await expect(page).toHaveURL(/\/settings\/safety$/);
    const overview = page.getByTestId('module-overview');
    for (const label of [
      'Hard training sessions',
      'Loaded stretching and mobility',
      'Cool finish to a shower (60-Day Reset)',
      'Contrast therapy',
      'Calorie targets',
    ]) {
      await expect(overview.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Change your health answers' })).toHaveAttribute(
      'href',
      '/onboarding/health?from=safety',
    );
  });

  test('stop guidance is on the screens that ask for effort', async ({ page }) => {
    await page.goto('/train/food');
    await expect(page.getByText('If food or numbers feel stressful')).toBeVisible();
    await page.goto('/reflect');
    await expect(page.getByText('If writing brings up something heavy')).toBeVisible();
  });

  test('one part of the account can be deleted, and the deletion is recorded', async ({
    page,
  }, testInfo) => {
    // The demo account is shared by both projects; one deletion is enough.
    test.skip(testInfo.project.name !== 'phone', 'Runs once, on the phone project.');
    await page.goto('/settings/privacy');
    const row = page.getByTestId('feature-deletion').getByRole('listitem').filter({
      hasText: 'Reminder history',
    });
    await row.getByRole('button', { name: 'Delete: Reminder history' }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Type “Reminder history” to confirm').fill('reminder history');
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(row.getByRole('status')).toHaveText('Deleted');

    await page.reload();
    await expect(page.getByTestId('audit-trail')).toContainText('Data deleted: Reminder history');
  });

  test('pages carry a content security policy, and nothing on them breaks it', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text()))
        violations.push(message.text());
    });
    for (const route of [
      '/today',
      '/train',
      '/mind',
      '/train/food',
      '/progress',
      '/settings/privacy',
    ]) {
      const response = await page.goto(route);
      expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    }
    expect(violations).toEqual([]);
  });
});
