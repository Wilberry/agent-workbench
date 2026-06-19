import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'E2E_TEST_EMAIL',
  'E2E_TEST_PASSWORD'
];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required env var ${name} for Playwright tests. Load the root .env or export it before running.`);
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { outputFolder: 'test-results/playwright' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3000}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    // Use an already-running dev server during local debugging on Windows.
    // Removing the `command` prevents Playwright from attempting to start
    // the server with a platform-specific pnpm invocation that can be
    // mis-parsed on Windows (e.g. app path + "--port").
    url: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3000}`,
    reuseExistingServer: true,
    timeout: 120000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
