import { expect, type Locator, test } from '@playwright/test';
import { mockInternetMapBackends } from './helpers/mapMock';

async function openBaseMap(page: Parameters<typeof mockInternetMapBackends>[0], path: string) {
  await mockInternetMapBackends(page);
  await page.goto(path);
  await expect(page.getByTestId('base-map-tabs')).toBeVisible();
  await expect(page.getByTestId('base-map-canvas')).toBeVisible();
}

async function useManualNodeScopeIfPrompted(page: Parameters<typeof mockInternetMapBackends>[0]) {
  const noButton = page.getByRole('button', { name: 'No' });
  if (await noButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await clickByDom(noButton);
    await expect(noButton).toHaveCount(0);
  }
}

async function clickByDom(locator: Locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
  await locator.evaluate((element) => {
    (element as HTMLElement).click();
  });
}

async function closeSettingsDialog(page: Parameters<typeof mockInternetMapBackends>[0]) {
  const closeButton = page.getByRole('button', { name: 'Close this dialog' }).first();
  if (await closeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await clickByDom(closeButton);
  }
}

test.describe('internet map pages', () => {
  test('Map page loads graph controls and submits a packet filter', async ({ page }) => {
    await openBaseMap(page, '/dev/map');

    await closeSettingsDialog(page);
    await clickByDom(page.getByTestId('base-map-tabs').getByRole('tab', { name: 'Filter' }));
    await page.getByPlaceholder('Type a BPF expression to animate packet flows on the map...').fill('icmp');
    await clickByDom(page.getByRole('button', { name: 'Submit' }));

    await expect(page.getByText('Submitted')).toBeVisible();
    await expect(page.getByTestId('base-map-log-toggle')).toBeVisible();
  });

  test('IXMap page opens settings and exposes IX controls', async ({ page }) => {
    await openBaseMap(page, '/dev/ixMap');
    await useManualNodeScopeIfPrompted(page);

    await expect(page.getByText('Num of IX')).toBeVisible();
    await expect(page.getByText('IX', { exact: true })).toBeVisible();
  });

  test('TransitMap page opens settings and exposes transit controls', async ({ page }) => {
    await openBaseMap(page, '/dev/transitMap');
    await useManualNodeScopeIfPrompted(page);

    await expect(page.getByText('Num of Transit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transits...' })).toBeVisible();
  });

  test('UploadMap page renders upload panel and shared map controls', async ({ page }) => {
    await mockInternetMapBackends(page);
    await page.goto('/dev/uploadMap');

    await expect(page.getByTestId('base-upload-map-tabs')).toBeVisible();
    await expect(page.getByTestId('base-upload-map-canvas')).toBeVisible();
    await expect(page.getByTestId('base-upload-map-upload-panel')).toBeVisible();
    await expect(page.getByTestId('base-upload-map-log-toggle')).toBeVisible();
  });
});
