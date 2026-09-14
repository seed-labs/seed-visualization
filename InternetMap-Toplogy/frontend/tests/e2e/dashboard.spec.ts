import { expect, test } from '@playwright/test';
import { containersResponse, networksResponse } from './fixtures/dashboard';

const api = {
  containers: '**/api/v1/container',
  networks: '**/api/v1/network',
};

test.describe('dashboard page states', () => {
  test('shows loading state while data is pending', async ({ page }) => {
    await page.route(api.containers, async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({ json: containersResponse });
    });
    await page.route(api.networks, route => route.fulfill({ json: networksResponse }));

    await page.goto('/dev/dashboard');

    await expect(page.getByTestId('dashboard-loading')).toBeVisible();
  });

  test('shows empty state when both tables have no data', async ({ page }) => {
    await page.route(api.containers, route => route.fulfill({ json: { ok: true, result: [] } }));
    await page.route(api.networks, route => route.fulfill({ json: { ok: true, result: [] } }));

    await page.goto('/dev/dashboard');

    await expect(page.getByTestId('dashboard-empty')).toBeVisible();
  });

  test('shows error state when an api returns not ok', async ({ page }) => {
    await page.route(api.containers, route => route.fulfill({ json: { ok: false, result: 'docker failed' } }));
    await page.route(api.networks, route => route.fulfill({ json: { ok: true, result: [] } }));

    await page.goto('/dev/dashboard');

    await expect(page.getByTestId('dashboard-error')).toContainText('reqGetContainersList error');
  });

  test('shows normal state with nodes and networks', async ({ page }) => {
    await page.route(api.containers, route => route.fulfill({ json: containersResponse }));
    await page.route(api.networks, route => route.fulfill({ json: networksResponse }));

    await page.goto('/dev/dashboard');

    await expect(page.getByTestId('dashboard-page')).toContainText('router-a');
    await expect(page.getByTestId('dashboard-page')).toContainText('10.0.0.0/24');
  });

  test('renders multi-interface nodes and multiple networks', async ({ page }) => {
    await page.route(api.containers, route => route.fulfill({
      json: {
        ok: true,
        result: [
          {
            Id: 'node-router',
            meta: {
              emulatorInfo: {
                asn: 151,
                name: 'router-b',
                role: 'BorderRouter',
                nets: [
                  { name: 'net0', address: '10.151.0.254/24' },
                  { name: 'ix100', address: '10.100.0.151/24' },
                ],
              },
            },
          },
          {
            Id: 'node-host',
            meta: {
              emulatorInfo: {
                asn: 151,
                name: 'host-b',
                role: 'Host',
                nets: [{ name: 'net0', address: '10.151.0.71/24' }],
              },
            },
          },
        ],
      },
    }));
    await page.route(api.networks, route => route.fulfill({
      json: {
        ok: true,
        result: [
          {
            Id: 'net-local',
            meta: {
              emulatorInfo: {
                scope: '151',
                name: 'net0',
                type: 'local',
                prefix: '10.151.0.0/24',
              },
            },
          },
          {
            Id: 'net-ix',
            meta: {
              emulatorInfo: {
                scope: 'ix',
                name: 'ix100',
                type: 'internet-exchange',
                prefix: '10.100.0.0/24',
              },
            },
          },
        ],
      },
    }));

    await page.goto('/dev/dashboard');

    const dashboard = page.getByTestId('dashboard-page');
    await expect(dashboard).toContainText('router-b');
    await expect(dashboard).toContainText('host-b');
    await expect(dashboard).toContainText('10.151.0.254/24');
    await expect(dashboard).toContainText('10.100.0.151/24');
    await expect(dashboard).toContainText('10.100.0.0/24');
  });
});
