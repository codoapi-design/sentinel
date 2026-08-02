import { expect, test } from '@playwright/test';

test.describe('Package 3 AI memory fixture', () => {
  test('persists a conversation across state reload and deletes it', async ({ page }) => {
    await page.goto('/e2e/ai-package3');
    await page.getByTestId('package3-seed').click();
    await expect(page.getByTestId('package3-conversations')).toContainText('Fixture conversation');
    await page.getByTestId('package3-chat-turn').click();
    await expect(page.getByTestId('package3-messages')).toContainText('E2E persisted turn');
    await page.reload();
    await expect(page.getByTestId('package3-messages')).toContainText('How is SOL doing?');
    await page.getByTestId('package3-delete-conversation').click();
    await expect(page.getByTestId('package3-conversations')).not.toContainText('Fixture conversation');
    await expect(page.getByTestId('package3-messages')).toHaveText(/Messages/);
  });
  test('shows historical A to B to C lifecycle', async ({ page }) => {
    await page.goto('/e2e/ai-package3');
    await page.getByTestId('package3-seed').click();
    await expect(page.getByTestId('package3-analyses')).toContainText(/needs attention|increased|worsened/);
    await expect(page.getByTestId('package3-lifecycle')).toContainText(/SOL high_asset_dependency/);
    await expect(page.getByTestId('package3-lifecycle')).toContainText(/\((2|3)\)/);
    await expect(page.getByTestId('package3-timeline')).toContainText(/high_asset_dependency/i);
  });
  test('persists explicit preference but not temporary style request', async ({ page }) => {
    await page.goto('/e2e/ai-package3');
    await page.getByTestId('package3-seed').click();
    await expect(page.getByTestId('package3-preferences')).toContainText('response_style:');
    await expect(page.getByTestId('package3-preferences')).toContainText('concise');
    await page.getByTestId('package3-temporary-style').click();
    await expect(page.getByTestId('package3-temporary-result')).toHaveText('Temporary style saved: false');
    await expect(page.getByTestId('package3-preferences')).not.toContainText('just this time');
  });
});
