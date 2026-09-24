import { expect, test } from '@playwright/test';
import { mockInternetMapBackends } from './helpers/mapMock';

test('live capture records packets, interval replay advances, and paused replay ignores new packets', async ({ page }) => {
  await mockInternetMapBackends(page);
  await page.goto('/dev/map/2d');
  const dock = page.getByTestId('emulator-topology-3d-dock');
  await expect(dock).toBeVisible({ timeout: 15_000 });
  await dock.getByRole('button', { name: 'Traffic Replay' }).click();
  await dock.getByPlaceholder('e.g. icmp or udp').fill('icmp or udp');
  await dock.getByRole('button', { name: 'Apply' }).click();
  await expect(dock.locator('.emulator-traffic-icon-button.record')).toBeEnabled();
  await dock.locator('.emulator-traffic-icon-button.record').click();

  const emitPacket = async (timestampNs: number) => {
    await page.evaluate((timestamp) => {
      const sockets = (window as unknown as { __mockTrafficSockets: WebSocket[] }).__mockTrafficSockets;
      const socket = sockets.find((item) => item.url.includes('/ws/packets') && item.readyState === WebSocket.OPEN);
      if (!socket) throw new Error('traffic websocket did not connect');
      socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
        type: 'packet',
        timestampNs: timestamp,
        containerName: 'as150h-host_0-10.150.0.71',
        sourceIp: '10.150.0.71',
        destIp: '10.151.0.71',
        ipProtocol: 'icmp',
      }) }));
    }, timestampNs);
  };

  await emitPacket(1_000_000_000);
  await emitPacket(2_000_000_000);
  await dock.locator('.emulator-traffic-icon-button.record').click();
  const position = dock.locator('.emulator-traffic-replay-seek em');
  await expect(position).toHaveText('0 / 2');
  await dock.locator('.emulator-traffic-replay-number').filter({ hasText: 'Event interval (ms)' }).locator('input').fill('10000');

  await dock.locator('[data-tooltip="Play replay"]').click();
  await expect(position).toHaveText('1 / 2');
  await dock.locator('[data-tooltip="Pause replay"]').click();
  await emitPacket(3_000_000_000);
  await expect(position).toHaveText('1 / 2');
  await dock.locator('[data-tooltip="Stop replay"]').click();
  await dock.locator('[data-tooltip="Clear packets"]').click();
  await expect(position).toHaveText('0 / 0');
});
