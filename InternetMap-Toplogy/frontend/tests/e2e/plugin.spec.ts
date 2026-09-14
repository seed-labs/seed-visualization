import { expect, test } from '@playwright/test';

const api = {
  install: '**/api/v1/install**',
  uninstall: '**/api/v1/uninstall',
};

test.describe('plugin management page', () => {
  test('loads plugins, searches by keyword, and sends install/uninstall actions', async ({ page }) => {
    const installRequests: unknown[] = [];
    const uninstallRequests: unknown[] = [];
    let lastInstallQuery = '';

    await page.route(api.install, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        lastInstallQuery = new URL(request.url()).searchParams.get('keyword') ?? '';
        await route.fulfill({
          json: {
            ok: true,
            result: lastInstallQuery
              ? [{ id: 'terminal', name: 'Terminal Plugin', version: '1.0.0' }]
              : [
                  { id: 'terminal', name: 'Terminal Plugin', version: '1.0.0' },
                  { id: 'map3d', name: 'Map 3D Plugin', version: '1.1.0' },
                ],
          },
        });
        return;
      }

      installRequests.push(request.postDataJSON());
      await route.fulfill({ json: { ok: true, result: request.postDataJSON() } });
    });

    await page.route(api.uninstall, async (route) => {
      uninstallRequests.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, result: route.request().postDataJSON() } });
    });

    await page.goto('/dev/plugin');

    await expect(page.getByText('Terminal Plugin')).toBeVisible();
    await expect(page.getByText('Map 3D Plugin')).toBeVisible();

    await page.getByPlaceholder('Keyword search (Press Enter)').fill('terminal');
    await page.keyboard.press('Enter');

    await expect.poll(() => lastInstallQuery).toBe('terminal');
    await expect(page.getByText('Terminal Plugin')).toBeVisible();
    await expect(page.getByText('Map 3D Plugin')).toHaveCount(0);

    await page.getByRole('button', { name: 'Install', exact: true }).evaluate((element) => {
      (element as HTMLElement).click();
    });
    await expect.poll(() => installRequests.length, { timeout: 5_000 }).toBe(1);
    expect(installRequests[0]).toMatchObject({ id: 'terminal', name: 'Terminal Plugin' });

    await page.getByRole('button', { name: 'Uninstall', exact: true }).evaluate((element) => {
      (element as HTMLElement).click();
    });
    await expect.poll(() => uninstallRequests.length, { timeout: 5_000 }).toBe(1);
    expect(uninstallRequests[0]).toMatchObject({ id: 'terminal', name: 'Terminal Plugin' });
  });
});
