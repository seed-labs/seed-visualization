import { expect, test } from '@playwright/test';
import {
  createStarlinkMockState,
  mockStarlinkBackends,
  openDockPage,
} from './helpers/starlinkMock';

test.describe('real Cesium globe rendering', () => {
  test('initializes the real 3D globe canvas and keeps UI overlays usable', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await mockStarlinkBackends(page, createStarlinkMockState(), { mockCesium: false });
    await page.goto('/dev/starlink');

    const globe = page.locator('.globe');
    const canvas = page.locator('.globe canvas').first();

    await expect(globe).toBeAttached({ timeout: 20_000 });
    await expect(globe).toBeVisible({ timeout: 20_000 });
    await expect(canvas).toBeVisible({ timeout: 20_000 });

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox?.width ?? 0).toBeGreaterThan(300);
    expect(canvasBox?.height ?? 0).toBeGreaterThan(300);

    await expect.poll(async () =>
      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('.globe canvas');
        if (!canvas) {
          return false;
        }

        return Boolean(
          canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl'),
        );
      }),
      { timeout: 20_000 },
    ).toBe(true);

    await expect.poll(async () =>
      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('.globe canvas');
        return {
          width: canvas?.width ?? 0,
          height: canvas?.height ?? 0,
        };
      }),
      { timeout: 20_000 },
    ).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });

    await openDockPage(page, /Satellites/);
    await expect(page.getByText('SAT-910001')).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((text) =>
      !text.includes('favicon') &&
      !text.includes('ERR_NETWORK_ACCESS_DENIED'),
    )).toEqual([]);
  });
});
