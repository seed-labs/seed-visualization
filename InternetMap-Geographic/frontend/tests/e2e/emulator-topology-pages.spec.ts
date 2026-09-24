import { expect, test } from '@playwright/test';
import { mockInternetMapBackends } from './helpers/mapMock';

for (const mode of ['3d', '2d'] as const) {
  test.describe(`InternetMap-Geographic ${mode} emulator topology pages`, () => {
    test('live emulator topology page loads from mocked Docker API data', async ({ page }) => {
      await mockInternetMapBackends(page);
      await page.goto(`/dev/map/${mode}`, { waitUntil: 'domcontentloaded' });

      const dock = page.getByTestId('emulator-topology-3d-dock');
      await expect(dock).toBeVisible({ timeout: 15_000 });
      await expect(dock.getByText(mode === '3d' ? 'Live Emulator Topology Globe' : 'Live Emulator Topology 2D', { exact: true })).toBeVisible();
      await expect(dock.getByText(/\d+ nodes \/ \d+ links/)).toBeVisible();
    });

    test('file-based emulator topology page shows compose upload entry', async ({ page }) => {
      await mockInternetMapBackends(page);
      await page.goto(`/dev/upload/${mode}`);

      await expect(page.getByTestId('emulator-topology-3d-upload-page')).toBeVisible();
      await expect(page.getByText('Drop file here or')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Parse file' })).toBeVisible();
    });
  });
}
