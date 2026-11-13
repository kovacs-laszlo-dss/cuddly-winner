import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: './report/test-results',
  reporter: [['list'], ['html', { outputFolder: 'report/html', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5258',
    browserName: 'chromium',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
  webServer: {
    command: 'node start-server.mjs',
    url: 'http://127.0.0.1:5258',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

