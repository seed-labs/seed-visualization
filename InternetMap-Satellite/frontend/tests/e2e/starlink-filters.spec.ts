import { expect, test } from '@playwright/test';
import {
  createStarlinkMockState,
  e2eClick,
  mockStarlinkBackends,
  openDockPage,
} from './helpers/starlinkMock';

test.describe('satellite filters', () => {
  test.beforeEach(async ({ page }) => {
    await mockStarlinkBackends(page, createStarlinkMockState());
    await page.goto('/dev/starlink');
    await openDockPage(page, /Satellites/);
  });

  test('supports inverted text search and clear filters', async ({ page }) => {
    await page.getByPlaceholder('Name or NORAD ID').fill('910001');
    await expect(page.getByText('SAT-910001')).toBeVisible();
    await expect(page.getByText('SAT-910002')).not.toBeVisible();

    await e2eClick(page.locator('.filter-input-row').getByRole('checkbox'));
    await expect(page.getByText('SAT-910001')).not.toBeVisible();
    await expect(page.getByText('SAT-910002')).toBeVisible();

    await e2eClick(page.locator('.satellite-filters summary'));
    await expect(page.locator('.satellite-filters summary')).toContainText('1 active');
    await e2eClick(page.getByRole('button', { name: 'Clear filters' }));

    await expect(page.getByPlaceholder('Name or NORAD ID')).toHaveValue('');
    await expect(page.getByText('SAT-910001')).toBeVisible();
    await expect(page.getByText('SAT-910002')).toBeVisible();
    await expect(page.locator('.satellite-filters summary')).toContainText('None');
  });

  test('supports altitude filter and inverted altitude filter', async ({ page }) => {
    await e2eClick(page.locator('.satellite-filters summary'));

    const minAltitude = page.locator('.altitude-range').getByRole('spinbutton').first();
    await minAltitude.fill('99999');
    await expect(page.locator('.satellite-row')).toHaveCount(0);
    await expect(page.locator('.satellite-filters summary')).toContainText('1 active');

    await e2eClick(page.locator('.filter-section', { hasText: 'Altitude' }).getByRole('checkbox'));
    await expect(page.getByText('SAT-910001')).toBeVisible();
    await expect(page.getByText('SAT-910002')).toBeVisible();

    await e2eClick(page.getByRole('button', { name: 'Clear filters' }));
    await expect(page.locator('.satellite-filters summary')).toContainText('None');
  });

  test('supports plane filter, shell-plane linkage, and clearing selected planes', async ({ page }) => {
    await e2eClick(page.locator('.satellite-filters summary'));

    await e2eClick(page.locator('.filter-section', { hasText: 'Plane filter' }).locator('.el-select'));
    await e2eClick(page.getByText('S1-P001', { exact: true }));
    await page.keyboard.press('Escape');

    await expect(page.getByText('SAT-910001')).toBeVisible();
    await expect(page.getByText('SAT-910002')).not.toBeVisible();
    await expect(page.locator('.satellite-filters summary')).toContainText('1 active');

    await e2eClick(page.getByRole('button', { name: 'Clear filters' }));
    await expect(page.getByText('SAT-910001')).toBeVisible();
    await expect(page.getByText('SAT-910002')).toBeVisible();

    await openDockPage(page, /Starlink Shells/);
    await e2eClick(page.getByRole('button', { name: /Shell S1\s+1/ }));
    await openDockPage(page, /Satellites/);

    await expect(page.getByText('SAT-910001')).not.toBeVisible();
    await expect(page.getByText('SAT-910002')).toBeVisible();
  });
});
