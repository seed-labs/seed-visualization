import { expect, test } from '@playwright/test';
import { mockInternetMapBackends } from './helpers/mapMock';

test.describe('internet map globe emulator topology pages', () => {
  test('live emulator topology page loads from mocked Docker API data', async ({ page }) => {
    await mockInternetMapBackends(page);
    await page.goto('/dev/map/3d');

    await expect(page.getByText('Live Emulator Topology Globe')).toBeVisible();
    await expect(page.getByText(/nodes/)).toBeVisible();
  });

  test('file-based emulator topology page shows compose upload entry', async ({ page }) => {
    await mockInternetMapBackends(page);
    await page.goto('/dev/upload/3d');

    await expect(page.getByTestId('emulator-topology-3d-upload-page')).toBeVisible();
    await expect(page.getByText('Drop file here or')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Parse file' })).toBeVisible();
  });
});
