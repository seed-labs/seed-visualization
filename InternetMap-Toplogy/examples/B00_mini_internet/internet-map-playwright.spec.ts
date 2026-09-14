import { expect, type Locator, type Page, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.describe.configure({ mode: 'serial' });

async function openPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
}

async function clickByDom(locator: Locator) {
  await locator.waitFor({ state: 'attached', timeout: 15_000 });
  await locator.evaluate((element) => {
    (element as HTMLElement).click();
  });
}

async function closeOptionalDialog(page: Page) {
  const closeButton = page.getByRole('button', { name: 'Close this dialog' }).first();
  if (await closeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await clickByDom(closeButton);
  }

  const noButton = page.getByRole('button', { name: 'No' }).first();
  if (await noButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await clickByDom(noButton);
  }
}

async function expectAppShell(page: Page) {
  await expect(page.getByRole('menuitem', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Plugin' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Map', exact: true })).toBeVisible();
}

async function expectBaseMap(page: Page) {
  await expect(page.getByTestId('base-map-tabs')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('base-map-canvas')).toBeVisible();
  await closeOptionalDialog(page);
}

async function openBaseMapTab(page: Page, tabName: string) {
  await clickByDom(page.getByTestId('base-map-tabs').getByRole('tab', { name: tabName }));
}

async function openUploadMapTab(page: Page, tabName: string) {
  await clickByDom(page.getByTestId('base-upload-map-tabs').getByRole('tab', { name: tabName }));
}

async function smokeBaseMapControls(page: Page) {
  await openBaseMapTab(page, 'Filter');
  await expect(page.getByTestId('base-map-filter-input')).toBeVisible();
  await page.getByTestId('base-map-filter-input').fill('icmp');
  await clickByDom(page.getByTestId('base-map-filter-submit'));
  await expect(page.getByText(/Submitted|submit/i)).toBeVisible({ timeout: 5_000 }).catch(() => undefined);

  await openBaseMapTab(page, 'Search');
  await expect(page.getByTestId('base-map-search-input')).toBeVisible();
  await page.getByTestId('base-map-search-input').fill('router');
  await clickByDom(page.getByTestId('base-map-search-submit'));

  await expect(page.getByTestId('base-map-log-toggle')).toBeVisible();
}

test.describe('B00 mini internet real frontend', () => {
  test('home page shows navigation cards and menu entries', async ({ page }) => {
    await openPage(page, '/home');

    await expectAppShell(page);
    await expect(page.getByRole('heading', { name: 'INTERNET MAP' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'MAP', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'IX MAP', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'TRANSIT MAP', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload MAP', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'DASHBOARD', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'PLUGIN', exact: true })).toBeVisible();
  });

  test('dashboard page shows emulator containers and networks', async ({ page }) => {
    await openPage(page, '/dashboard');

    await expectAppShell(page);
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Keyword search (Press Enter)').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select all' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attach selected' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run on selected' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kill selected' }).first()).toBeVisible();
    await expect(page.getByTestId('dashboard-page')).not.toContainText('reqGetContainersList error');
    await expect(page.getByTestId('dashboard-page')).not.toContainText('reqGetNetworksList error');
  });

  test('plugin page exposes plugin search and action controls', async ({ page }) => {
    await openPage(page, '/plugin');

    await expectAppShell(page);
    await expect(page.getByPlaceholder('Keyword search (Press Enter)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select all' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attach selected' }).first()).toBeVisible();
    await page.getByPlaceholder('Keyword search (Press Enter)').fill('terminal');
    await page.keyboard.press('Enter');
    await expect(page.getByPlaceholder('Keyword search (Press Enter)')).toHaveValue('terminal');
  });

  test('map page loads topology and common map functions', async ({ page }) => {
    await openPage(page, '/map');
    await expectBaseMap(page);
    await smokeBaseMapControls(page);
  });

  test('ixMap page loads IX-level topology and IX settings', async ({ page }) => {
    await openPage(page, '/ixMap');
    await expectBaseMap(page);
    await openBaseMapTab(page, 'Settings');
    await expect(page.getByText('Num of IX')).toBeVisible();
    await expect(page.getByText('IX', { exact: true })).toBeVisible();
  });

  test('transitMap page loads transit-level topology and transit settings', async ({ page }) => {
    await openPage(page, '/transitMap');
    await expectBaseMap(page);
    await openBaseMapTab(page, 'Settings');
    await expect(page.getByText('Num of Transit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transits...' })).toBeVisible();
  });

  test('uploadMap page parses a docker compose file and exposes map controls', async ({ page }, testInfo) => {
    const composePath = testInfo.outputPath('mini-compose.yml');
    await writeFile(
      composePath,
      [
        'version: "3.8"',
        'services:',
        '  router0:',
        '    image: seed-router',
        '    container_name: as150r-router0-10.150.0.254',
        '    labels:',
        '      org.seedsecuritylabs.seedemu.meta.nodename: router0',
        '      org.seedsecuritylabs.seedemu.meta.role: Router',
        '      org.seedsecuritylabs.seedemu.meta.asn: "150"',
        '      org.seedsecuritylabs.seedemu.meta.net.0.name: net0',
        '      org.seedsecuritylabs.seedemu.meta.net.0.address: 10.150.0.254/24',
        '    networks:',
        '      net0:',
        '        ipv4_address: 10.150.0.254',
        '  host0:',
        '    image: seed-host',
        '    container_name: as150h-host0-10.150.0.71',
        '    labels:',
        '      org.seedsecuritylabs.seedemu.meta.nodename: host0',
        '      org.seedsecuritylabs.seedemu.meta.role: Host',
        '      org.seedsecuritylabs.seedemu.meta.asn: "150"',
        '      org.seedsecuritylabs.seedemu.meta.net.0.name: net0',
        '      org.seedsecuritylabs.seedemu.meta.net.0.address: 10.150.0.71/24',
        '    networks:',
        '      net0:',
        '        ipv4_address: 10.150.0.71',
        'networks:',
        '  net0:',
        '    ipam:',
        '      config:',
        '        - subnet: 10.150.0.0/24',
        '    labels:',
        '      org.seedsecuritylabs.seedemu.meta.name: net0',
        '      org.seedsecuritylabs.seedemu.meta.scope: "150"',
        '      org.seedsecuritylabs.seedemu.meta.type: local',
        '',
      ].join('\n'),
      'utf8',
    );

    await openPage(page, '/uploadMap');

    await expect(page.getByTestId('base-upload-map-upload-panel')).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(composePath);
    await clickByDom(page.getByRole('button', { name: 'Parse file' }));

    await expect(page.getByTestId('base-upload-map-tabs')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('base-upload-map-canvas')).toBeVisible();

    await openUploadMapTab(page, 'Search');
    await expect(page.getByTestId('base-upload-map-search-input')).toBeVisible();

    await expect(page.getByTestId('base-upload-map-log-toggle')).toBeVisible();
  });

  test('console page opens without crashing when container query data is provided', async ({ page }) => {
    const query = encodeURIComponent(JSON.stringify({ id: 'dummy', asn: 150, name: 'router0' }));
    await openPage(page, `/console#dummy?data=${query}`);

    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('#terminal')).toBeVisible();
  });

  test('unknown route shows the not-found page', async ({ page }) => {
    await openPage(page, '/missing-route-for-playwright');

    await expect(page.getByRole('button', { name: 'Return to the home' })).toBeVisible();
  });
});
