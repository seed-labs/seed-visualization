import { expect, test } from '@playwright/test';
import {
  createStarlinkMockState,
  e2eClick,
  mockStarlinkBackends,
  openDockPage,
  sendTrafficPacket,
} from './helpers/starlinkMock';

test.describe('traffic replay capture and playback', () => {
  test.beforeEach(async ({ page }) => {
    await mockStarlinkBackends(page, createStarlinkMockState());
    await page.goto('/dev/starlink');
    await openDockPage(page, /Traffic Replay/);
  });

  test('records only while capture and recording are enabled', async ({ page }) => {
    const recordButton = page.locator('.traffic-icon-button.record');
    const playButton = page.locator('.traffic-replay-controls .traffic-icon-button').nth(1);

    await expect(recordButton).toBeEnabled();
    await e2eClick(recordButton);
    await expect(recordButton).not.toHaveClass(/active/);
    await sendTrafficPacket(page, 0);
    await expect(page.getByRole('heading', { name: /Traffic Replay\s+0/ })).toBeVisible();

    await page.getByPlaceholder('tcpdump-like filter, e.g. icmp').fill('icmp');
    await e2eClick(page.getByRole('button', { name: /Apply/i }));
    await expect(page.getByText('Collector filter active: icmp')).toBeVisible();

    await expect(recordButton).toBeEnabled();
    await e2eClick(recordButton);
    await expect(recordButton).toHaveClass(/active/);
    await expect(playButton).toBeDisabled();

    await sendTrafficPacket(page, 1);
    await sendTrafficPacket(page, 2);
    await expect(page.getByRole('heading', { name: /Traffic Replay\s+2/ })).toBeVisible();
    await expect(page.locator('.traffic-replay-seek')).toContainText('0 / 2');

    await e2eClick(recordButton);
    await expect(recordButton).not.toHaveClass(/active/);
    await expect(playButton).toBeEnabled();
  });

  test('plays, pauses, jumps, seeks, stops, and clears recorded packets', async ({ page }) => {
    await page.getByPlaceholder('tcpdump-like filter, e.g. icmp').fill('icmp');
    await e2eClick(page.getByRole('button', { name: /Apply/i }));
    await e2eClick(page.locator('.traffic-icon-button.record'));
    await sendTrafficPacket(page, 2);
    await sendTrafficPacket(page, 1);
    await e2eClick(page.locator('.traffic-icon-button.record'));

    await expect(page.getByRole('heading', { name: /Traffic Replay\s+2/ })).toBeVisible();
    await expect(page.locator('.traffic-replay-panel')).toContainText(/2026-07-15/);

    await page.locator('.traffic-replay-number').getByRole('spinbutton').fill('5000');
    await e2eClick(page.locator('[data-tooltip="Play replay"]'));
    await expect(page.locator('.traffic-replay-seek')).toContainText('1 / 2');
    await expect(page.locator('[data-tooltip="Pause replay"]')).toHaveClass(/active/);

    await e2eClick(page.locator('[data-tooltip="Pause replay"]'));
    await expect(page.locator('[data-tooltip="Play replay"]')).toBeEnabled();

    await e2eClick(page.locator('[data-tooltip="Next packet"]'));
    await expect(page.locator('.traffic-replay-seek')).toContainText('2 / 2');

    await e2eClick(page.locator('[data-tooltip="Previous packet"]'));
    await expect(page.locator('.traffic-replay-seek')).toContainText('1 / 2');

    await e2eClick(page.locator('.traffic-replay-slider .el-slider__runway'));
    await expect(page.locator('.traffic-replay-seek')).toContainText(/1 \/ 2|2 \/ 2/);

    await e2eClick(page.locator('[data-tooltip="Stop replay and return to real time"]'));
    await expect(page.locator('.traffic-replay-seek')).toContainText('0 / 2');

    await e2eClick(page.locator('[data-tooltip="Clear recorded packets"]'));
    await expect(page.getByRole('heading', { name: /Traffic Replay\s+0/ })).toBeVisible();
    await expect(page.locator('.traffic-replay-seek')).toContainText('0 / 0');
  });

  test('searches known and packet-discovered container nodes', async ({ page }) => {
    await page.getByPlaceholder('Search nodes by name, IP, container, or id').fill('host');
    await expect(page.getByText('Host 0')).toBeVisible();
    await expect(page.getByText('10.150.0.71')).toBeVisible();

    await page.getByPlaceholder('Search nodes by name, IP, container, or id').fill('10.150.0.254');
    await expect(page.getByText('Router 0')).toBeVisible();

    await page.getByPlaceholder('tcpdump-like filter, e.g. icmp').fill('icmp');
    await e2eClick(page.getByRole('button', { name: /Apply/i }));
    await sendTrafficPacket(page, 3, {
      containerName: 'generated-container',
      containerId: 'generated-container-1234567890',
      nodeName: 'Generated Node',
      nodeIp: '10.200.0.9',
    });

    await page.getByPlaceholder('Search nodes by name, IP, container, or id').fill('Generated');
    await expect(page.getByText('Generated Node')).toBeVisible();
    await expect(page.getByText('10.200.0.9')).toBeVisible();
    await e2eClick(page.getByText('Generated Node'));
    await expect(page.getByText('Generated Node')).toBeVisible();
  });
});
