import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /internet-map-playwright\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.INTERNET_MAP_BASE_URL ?? 'http://192.168.122.128:8080/pro',
    trace: 'on-first-retry',
    viewport: null,
    launchOptions: {
      slowMo: Number(process.env.PLAYWRIGHT_SLOW_MO ?? 5000),
      args: ['--start-maximized'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {},
    },
  ],
});
