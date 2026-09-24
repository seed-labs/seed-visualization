import path from 'node:path';
import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('10k upload keeps dock tabs responsive', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.route('**/satellite-tiles/**', route => route.abort());
  await page.addInitScript(() => {
    (window as any).__dockMetrics = { graphUpdates: 0, visibilityUpdates: 0, topologyClears: 0, frames: 0, clicks: [], longTasks: [] };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) (window as any).__dockMetrics.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ entryTypes: ['longtask'] });
    document.addEventListener('click', event => {
      const button = (event.target as Element).closest('.emulator-topology-3d-tabs button');
      if (!button) return;
      const metrics = (window as any).__dockMetrics;
      const item: any = { name: button.textContent?.trim(), start: performance.now(), graphUpdates: metrics.graphUpdates, frames: metrics.frames };
      metrics.clicks.push(item);
      const observer = new MutationObserver(() => {
        if (!button.classList.contains('active')) return;
        item.domMs = performance.now() - item.start;
        observer.disconnect();
        requestAnimationFrame(() => {
          item.frameMs = performance.now() - item.start;
          item.extraGraphUpdates = metrics.graphUpdates - item.graphUpdates;
          item.extraFrames = metrics.frames - item.frames;
        });
      });
      observer.observe(button, { attributes: true, attributeFilter: ['class'] });
    }, true);
  });
  await page.goto('/dev/upload/3d');
  await page.locator('input[type=file]').setInputFiles(path.resolve('../examples/E01_large_internet_10k/docker-compose-10k-with-geo.yml'));
  const uploadStartedAt = Date.now();
  await page.getByRole('button', { name: 'Parse file', exact: true }).click();
  const dock = page.getByTestId('emulator-topology-3d-dock');
  await expect(dock).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.emulator-topology-loading-overlay')).toHaveCount(0, { timeout: 120_000 });
  const uploadLoadingMs = Date.now() - uploadStartedAt;
  await testInfo.attach('upload-loading-time-ms', { body: String(uploadLoadingMs), contentType: 'text/plain' });
  console.log('10k upload loading time (ms):', uploadLoadingMs);
  const pickerTimings: Record<string, number> = {};
  const beforePickers = await page.evaluate(() => ({
    updates: (window as any).__dockMetrics.graphUpdates,
    clears: (window as any).__dockMetrics.topologyClears,
  }));
  for (const name of ['AS', 'IX', 'AS']) {
    const card = dock.locator('.emulator-topology-3d-stat-card').filter({ has: page.getByText(name, { exact: true }) });
    const elapsed = await card.evaluate(async element => {
      const start = performance.now();
      (element as HTMLButtonElement).click();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return performance.now() - start;
    });
    pickerTimings[`${name}-${Object.keys(pickerTimings).length}`] = elapsed;
    const picker = page.locator('.emulator-topology-3d-picker:visible');
    await expect(picker).toBeVisible();
    if (name === 'AS') {
      await expect(picker.getByRole('switch')).not.toBeChecked();
      await expect(picker.locator('.emulator-topology-3d-as-detail-list')).toHaveCount(0);
    }
    await picker.locator('.el-select').click();
    const options = page.locator('.emulator-topology-3d-select-popper:visible [role=option]');
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeLessThan(30);
    await picker.getByRole('combobox').press('Escape');
    await expect(options).toHaveCount(0);
    // Explicitly enable Details once to verify that reopening resets it.
    if (name === 'AS' && Object.keys(pickerTimings).length === 1) {
      await picker.locator('.el-switch').click();
      await expect(picker.getByRole('switch')).toBeChecked();
    }
    await card.click();
    await expect(picker).toHaveCount(0);
    expect(elapsed).toBeLessThan(1000);
  }
  expect(await page.evaluate(() => ({
    updates: (window as any).__dockMetrics.graphUpdates,
    clears: (window as any).__dockMetrics.topologyClears,
  }))).toEqual(beforePickers);

  for (const filter of [
    { card: 'AS', button: 'Apply AS filter' },
    { card: 'IX', button: 'Apply IX filter' },
  ]) {
    const card = dock.locator('.emulator-topology-3d-stat-card').filter({ has: page.getByText(filter.card, { exact: true }) });
    await card.click();
    const picker = page.locator('.emulator-topology-3d-picker:visible');
    await picker.locator('.el-select').click();
    const options = page.locator('.emulator-topology-3d-select-popper:visible [role=option]');
    await expect(options.first()).toBeVisible();
    const updatesBeforeSelection = await page.evaluate(() => (window as any).__dockMetrics.graphUpdates);
    await options.first().click();
    await page.waitForTimeout(300);
    await expect(picker).toBeVisible();
    await picker.getByRole('combobox').press('Escape');
    expect(await page.evaluate(() => (window as any).__dockMetrics.graphUpdates)).toBe(updatesBeforeSelection);

    await picker.getByRole('button', { name: filter.button, exact: true }).click();
    await expect(picker).toHaveCount(0);
    await page.waitForFunction(updates => (window as any).__dockMetrics.graphUpdates > updates, updatesBeforeSelection);
    await expect(page.locator('.emulator-topology-loading-overlay')).toHaveCount(0, { timeout: 120_000 });

    const updatesBeforeClear = await page.evaluate(() => (window as any).__dockMetrics.graphUpdates);
    await dock.getByRole('button', { name: 'Clear topology filters', exact: true }).click();
    await page.waitForFunction(
      updates => (window as any).__dockMetrics.graphUpdates > updates,
      updatesBeforeClear,
      { timeout: 120_000 },
    );
    await expect(page.locator('.emulator-topology-loading-overlay')).toHaveCount(0, { timeout: 120_000 });
  }
  await testInfo.attach('stat-card-open-times-ms', { body: JSON.stringify(pickerTimings), contentType: 'application/json' });
  console.log('10k AS/IX card open times (ms):', pickerTimings);
  const timings: Record<string, number> = {};
  await page.evaluate(() => { (window as any).__dockMetrics.longTasks = []; });
  for (let round = 0; round < 2; round++) {
    for (const name of ['Settings', 'Traffic Replay', 'Overview']) {
      const start = Date.now();
      const button = dock.getByRole('button', { name, exact: true });
      await button.click({ timeout: 15000 });
      await expect(button).toHaveClass(/active/, { timeout: 5000 });
      timings[`${round}-${name}`] = Date.now() - start;
    }
  }
  await dock.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsPage = dock.locator('.emulator-topology-3d-settings-page');
  const scaleHandle = settingsPage.locator('.el-slider__button-wrapper');
  for (const position of ['0%', '100%']) {
    await scaleHandle.evaluate((element, left) => { (element as HTMLElement).style.left = left; }, position);
    const bounds = await page.evaluate(() => {
      const pageElement = document.querySelector('.emulator-topology-3d-settings-page')!;
      const button = pageElement.querySelector('.el-slider__button')!;
      const pageRect = pageElement.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        buttonLeft: buttonRect.left,
        buttonRight: buttonRect.right,
        pageLeft: pageRect.left,
        pageRight: pageRect.right,
      };
    });
    expect(bounds.buttonLeft).toBeGreaterThanOrEqual(bounds.pageLeft);
    expect(bounds.buttonRight).toBeLessThanOrEqual(bounds.pageRight);
  }
  await expect.poll(() => settingsPage.evaluate(element => getComputedStyle(element).overflowX)).toBe('hidden');
  const beforeVisibility = await page.evaluate(() => ({
    updates: (window as any).__dockMetrics.graphUpdates,
    visibilityUpdates: (window as any).__dockMetrics.visibilityUpdates,
    clears: (window as any).__dockMetrics.topologyClears,
  }));
  const hostVisibility = dock.getByRole('checkbox', { name: 'Host', exact: true });
  await dock.getByText('Host', { exact: true }).click();
  await expect(hostVisibility).not.toBeChecked();
  await page.waitForFunction(updates => (window as any).__dockMetrics.visibilityUpdates > updates, beforeVisibility.visibilityUpdates);
  const afterVisibility = await page.evaluate(() => ({
    updates: (window as any).__dockMetrics.graphUpdates,
    visibilityUpdates: (window as any).__dockMetrics.visibilityUpdates,
    clears: (window as any).__dockMetrics.topologyClears,
  }));
  expect(afterVisibility.updates).toBe(beforeVisibility.updates);
  expect(afterVisibility.visibilityUpdates).toBe(beforeVisibility.visibilityUpdates + 1);
  expect(afterVisibility.clears).toBe(beforeVisibility.clears);
  const metrics = await page.evaluate(() => (window as any).__dockMetrics);
  await testInfo.attach('dock-diagnostics', { body: JSON.stringify(metrics), contentType: 'application/json' });
  expect(metrics.graphUpdates).toBeGreaterThan(0);
  expect(metrics.clicks).toHaveLength(7);
  for (const click of metrics.clicks.slice(0, 6)) {
    expect(click.domMs).toBeLessThan(1000);
    expect(click.extraGraphUpdates).toBe(0);
  }
  expect(Object.keys(timings)).toHaveLength(6);
  await testInfo.attach('dock-switch-times-ms', { body: JSON.stringify(timings), contentType: 'application/json' });
  console.log('10k dock switch times (ms):', timings);
});
