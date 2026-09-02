import { expect, test } from '@playwright/test';
import {
  createStarlinkMockState,
  e2eClick,
  mockStarlinkBackends,
  openDockPage,
  type StarlinkMockState,
} from './helpers/starlinkMock';

test.describe('satellite emulator dashboard with mocked backends', () => {
  let mockState: StarlinkMockState;

  test.beforeEach(async ({ page }) => {
    mockState = {
      trafficFilterRequests: [],
    };
    await mockStarlinkBackends(page, mockState);
    await page.goto('/dev/starlink');
  });

  test('shows the Starlink Shells tab from mocked orbit data', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Starlink Shells/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Shell S1')).toBeVisible();
    await expect(page.getByText('Shell S2')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Starlink Shells\s+2/ })).toBeVisible();

    const shellS1 = page.getByRole('button', { name: /Shell S1\s+1/ });
    await expect(shellS1).not.toHaveClass(/muted/);
    await e2eClick(shellS1);
    await expect(shellS1).toHaveClass(/muted/);
    await e2eClick(shellS1);
    await expect(shellS1).not.toHaveClass(/muted/);
  });

  test('filters and selects satellites in the Satellites tab', async ({ page }) => {
    await openDockPage(page, /Satellites/);

    await expect(page.getByPlaceholder('Name or NORAD ID')).toBeVisible();
    await expect(page.getByText('SAT-910001')).toBeVisible();
    await expect(page.getByText('SAT-910002')).toBeVisible();

    await page.getByPlaceholder('Name or NORAD ID').fill('910001');
    await expect(page.getByText('SAT-910001')).toBeVisible();
    await expect(page.getByText('SAT-910002')).not.toBeVisible();

    const sat910001 = page.locator('.satellite-row', { hasText: 'SAT-910001' });
    await e2eClick(sat910001);
    await expect(sat910001).toHaveClass(/active/);

    await openDockPage(page, /Selected/);

    await expect(page.getByRole('heading', { name: /Selected\s+1/ })).toBeVisible();
    await expect(page.getByText('Orbits visible')).toBeVisible();
    await expect(page.getByText('SAT-910001')).toBeVisible();

    await e2eClick(page.getByLabel('Remove selection'));
    await expect(page.getByText('No selected satellites')).toBeVisible();
  });

  test('shows empty state in the Selected tab before a satellite is selected', async ({ page }) => {
    await openDockPage(page, /Selected/);

    await expect(page.getByText('No selected satellites')).toBeVisible();
  });

  test('searches and selects stations in the Stations tab', async ({ page }) => {
    await openDockPage(page, /Stations/);

    await expect(page.getByPlaceholder('Search station, city, or ID')).toBeVisible();
    await expect(page.getByText('Mock Gateway Alpha')).toBeVisible();

    await page.getByPlaceholder('Search station, city, or ID').fill('Beta');
    await expect(page.getByText('Mock Gateway Beta')).toBeVisible();
    await expect(page.getByText('Mock Gateway Alpha')).not.toBeVisible();

    const betaStation = page.locator('.ground-station-row', { hasText: 'Mock Gateway Beta' });
    const wasSelected = (await betaStation.getAttribute('class'))?.includes('selected') ?? false;
    await e2eClick(betaStation);
    if (wasSelected) {
      await expect(betaStation).not.toHaveClass(/selected/);
    } else {
      await expect(betaStation).toHaveClass(/selected/);
    }
    await expect(page.getByText(/selected/)).toBeVisible();
  });

  test('opens Traffic Replay tab, searches container nodes, and submits a mocked packet filter', async ({ page }) => {
    await openDockPage(page, /Traffic Replay/);

    await expect(page.getByText('Packet Playback')).toBeVisible();
    await page.getByPlaceholder('Search nodes by name, IP, container, or id').fill('router0');
    await expect(page.getByText('router0')).toBeVisible();
    await expect(page.getByText('Router 0')).toBeVisible();

    await page.getByPlaceholder('tcpdump-like filter, e.g. icmp').fill('icmp');
    await e2eClick(page.getByRole('button', { name: /Apply/i }));

    await expect.poll(() => mockState.trafficFilterRequests).toEqual(['icmp']);
    await expect(page.getByText(/icmp/)).toBeVisible();
    await expect(page.getByText('Event interval (ms)')).toBeVisible();
    await expect(page.getByText('Packet', { exact: true })).toBeVisible();

    await page.getByPlaceholder('tcpdump-like filter, e.g. icmp').fill('');
    await e2eClick(page.getByRole('button', { name: /Apply/i }));
    await expect.poll(() => mockState.trafficFilterRequests).toEqual(['icmp', '']);
  });

  test('opens Settings tab and updates visible controls', async ({ page }) => {
    await openDockPage(page, /Settings/);

    await expect(page.getByText('System time')).toBeVisible();
    await expect(page.getByText('Simulation speed')).toBeVisible();
    await expect(page.getByText('Show satellites')).toBeVisible();
    await expect(page.getByText('Show ground stations')).toBeVisible();

    await e2eClick(page.getByRole('button', { name: 'Pause' }));
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    await expect(page.locator('.time-control-heading')).toContainText('Paused');

    const showSatellitesSwitch = page.locator('.switch-grid').getByRole('switch').first();
    await expect(showSatellitesSwitch).toHaveAttribute('aria-checked', 'true');
    await e2eClick(showSatellitesSwitch);
    await expect(showSatellitesSwitch).toHaveAttribute('aria-checked', 'false');
  });

  test('expands Timeline Events and shows mocked link update events in the event list', async ({ page }) => {
    await e2eClick(page.getByRole('button', { name: 'Expand timeline' }));

    await expect(page.getByText('Timeline Events')).toBeVisible();
    await expect(page.getByRole('button', { name: /Event List/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move timeline left' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move timeline right' })).toBeVisible();

    await e2eClick(page.getByRole('button', { name: /Event List/ }));

    await expect(page.locator('.timeline-event-list')).toBeVisible();
    await expect(page.locator('.timeline-event-table-head')).toContainText('Date');
    await expect(page.locator('.timeline-event-table-head')).toContainText('Type');
    await expect(page.locator('.timeline-event-table-head')).toContainText('Event');
    await expect(page.locator('.timeline-event-rows')).toContainText('Added');
    await expect(page.locator('.timeline-event-rows')).toContainText(/91000[12]->starlink-gs-/);

    await e2eClick(page.locator('.timeline-sort-button'));
    await expect(page.locator('.timeline-event-list')).toBeVisible();

    await e2eClick(page.locator('.timeline-event-list header button'));
    await expect(page.locator('.timeline-event-list')).not.toBeVisible();

    await e2eClick(page.getByRole('button', { name: 'Collapse timeline' }));
    await expect(page.getByRole('button', { name: 'Expand timeline' })).toBeVisible();
  });

  test('records manual TimeEvent entries when applying and resetting system time', async ({ page }) => {
    await openDockPage(page, /Settings/);

    await page.locator('.time-control').getByRole('spinbutton').fill('1782977608');
    await e2eClick(page.locator('.time-control').getByRole('button', { name: 'Apply' }));
    await e2eClick(page.locator('.time-control').getByRole('button', { name: 'Use current time' }));

    await e2eClick(page.getByRole('button', { name: 'Expand timeline' }));
    await e2eClick(page.getByRole('button', { name: /Event List/ }));

    await expect(page.locator('.timeline-event-rows')).toContainText('Jump');
    await expect(page.locator('.timeline-event-rows')).toContainText('Reset');
    await expect(page.locator('.timeline-event-rows')).toContainText('Jumped to');
    await expect(page.locator('.timeline-event-rows')).toContainText('Reset to');
  });

  test('collapses and expands the right dock without losing page navigation', async ({ page }) => {
    await expect(page.locator('.right-dock')).not.toHaveClass(/collapsed/);

    await e2eClick(page.locator('.dock-edge-toggle'));
    await expect(page.locator('.right-dock')).toHaveClass(/collapsed/);

    await e2eClick(page.locator('.dock-edge-toggle'));
    await expect(page.locator('.right-dock')).not.toHaveClass(/collapsed/);

    await openDockPage(page, /Traffic Replay/);
    await expect(page.getByText('Packet Playback')).toBeVisible();
  });
});
