import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e_tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'cd backend && node src/index.js',
      port: 3010,
      timeout: 30000,
      reuseExistingServer: true,
      env: {
        DATABASE_URL: 'postgresql://petmed:petmed_dev_password@localhost:5433/petmed',
        SESSION_SECRET: 'test-secret',
        ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
        EVIDENCE_STORAGE_PATH: '/tmp/petmed-evidence-test',
        PORT: '3010',
        HOST: '0.0.0.0',
      },
    },
    {
      command: 'cd frontend && VITE_API_URL=http://localhost:3010 npm run dev -- --port 5174',
      port: 5174,
      timeout: 30000,
      reuseExistingServer: true,
    },
  ],
});
