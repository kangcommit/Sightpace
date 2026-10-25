import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    // Use an owned server with synthetic auth config; never reuse a personal session/DB.
    reuseExistingServer: false,
    env: {
      TRAILPLAN_E2E: '1',
      BETTER_AUTH_URL: 'http://127.0.0.1:3100',
      BETTER_AUTH_SECRET: 'synthetic-browser-test-secret-abcdefghijklmnopqrstuvwxyz-0123456789',
      GOOGLE_CLIENT_ID: 'synthetic-browser-client',
      GOOGLE_CLIENT_SECRET: 'synthetic-browser-secret',
      DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/trailplan_e2e_unused',
    },
  },
})
