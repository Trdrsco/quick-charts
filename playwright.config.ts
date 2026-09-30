import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './test/browser',
  timeout: 240_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-report.json' }]],
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5298', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { command: 'node clean-room/browser-consumer/serve.mjs', url: 'http://127.0.0.1:5298', timeout: 120_000 },
})
