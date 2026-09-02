import { expect, test } from '@playwright/test';
import {
  createStarlinkMockState,
  e2eClick,
  mockStarlinkBackends,
  openDockPage,
} from './helpers/starlinkMock';

test.describe('ground station and settings controls', () => {
  test.beforeEach(async ({ page }) => {
    await mockStarlinkBackends(page, createStarlinkMockState());
    await page.goto('/dev/starlink');
  });

  test('supports station select all and invert', async ({ page }) => {
    await openDockPage(page, /Stations/);

    const stationStatus = page.locator('.station-filter-actions > span');
    const selectedRows = page.locator('.ground-station-row.selected');

    await expect(page.locator('.ground-station-row')).toHaveCount(2);
    await e2eClick(page.getByRole('button', { name: 'Select all' }));
    await expect(stationStatus).toContainText(/[1-9]\d* \/ [1-9]\d* (linked )?selected/);
    await expect.poll(() => selectedRows.count()).toBeGreaterThan(0);

    await e2eClick(page.getByRole('button', { name: 'Invert' }));
    await expect(stationStatus).toContainText(/selected/);

    await e2eClick(page.getByRole('button', { name: 'Select all' }));
    await expect(stationStatus).toContainText(/[1-9]\d* \/ [1-9]\d* (linked )?selected/);
    await expect.poll(() => selectedRows.count()).toBeGreaterThan(0);
  });

  test('supports selected satellite clear all', async ({ page }) => {
    await openDockPage(page, /Satellites/);
    await e2eClick(page.locator('.satellite-row', { hasText: 'SAT-910001' }));
    await e2eClick(page.locator('.satellite-row', { hasText: 'SAT-910002' }));

    await openDockPage(page, /Selected/);
    await expect(page.getByRole('heading', { name: /Selected\s+2/ })).toBeVisible();

    await e2eClick(page.getByRole('button', { name: 'Clear all' }));
    await expect(page.getByRole('heading', { name: /Selected\s+0/ })).toBeVisible();
    await expect(page.getByText('No selected satellites')).toBeVisible();
  });

  test('toggles all settings switches', async ({ page }) => {
    await openDockPage(page, /Settings/);

    const switches = page.locator('.switch-grid').getByRole('switch');
    await expect(switches).toHaveCount(7);

    await expect(switches.nth(0)).toHaveAttribute('aria-checked', 'true');
    await e2eClick(switches.nth(0));
    await expect(switches.nth(0)).toHaveAttribute('aria-checked', 'false');

    await expect(switches.nth(1)).toHaveAttribute('aria-checked', 'true');
    await e2eClick(switches.nth(1));
    await expect(switches.nth(1)).toHaveAttribute('aria-checked', 'false');

    await expect(switches.nth(2)).toHaveAttribute('aria-checked', 'false');
    await e2eClick(switches.nth(2));
    await expect(switches.nth(2)).toHaveAttribute('aria-checked', 'true');

    await expect(switches.nth(3)).toHaveAttribute('aria-checked', 'false');
    await e2eClick(switches.nth(3));
    await expect(switches.nth(3)).toHaveAttribute('aria-checked', 'true');

    await expect(switches.nth(4)).toHaveAttribute('aria-checked', 'false');
    await e2eClick(switches.nth(4));
    await expect(switches.nth(4)).toHaveAttribute('aria-checked', 'true');

    await expect(switches.nth(5)).toHaveAttribute('aria-checked', 'false');
    await e2eClick(switches.nth(5));
    await expect(switches.nth(5)).toHaveAttribute('aria-checked', 'true');

    await expect(switches.nth(6)).toHaveAttribute('aria-checked', 'true');
    await e2eClick(switches.nth(6));
    await expect(switches.nth(6)).toHaveAttribute('aria-checked', 'false');
  });

  test('disables simulation speed while traffic capture is active', async ({ page }) => {
    await openDockPage(page, /Traffic Replay/);

    await page.getByPlaceholder('tcpdump-like filter, e.g. icmp').fill('icmp');
    await e2eClick(page.getByRole('button', { name: /Apply/i }));
    await expect(page.getByText('Collector filter active: icmp')).toBeVisible();

    await e2eClick(page.locator('.dock-pager button').nth(2));
    await expect(page.getByText('System time')).toBeVisible();
    await expect(page.getByRole('radio', { name: '1x' })).toBeChecked();
    await expect(page.getByRole('radio', { name: '10x' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: '60x' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: '600x' })).toBeDisabled();
  });
});
