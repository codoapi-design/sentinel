import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'off',
  },
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        // Webpack avoids Turbopack Windows absolute-alias issues for wagmi stubs.
        command: 'npx next dev --webpack -p 3000',
        url: 'http://127.0.0.1:3000',
        // Fixture page requires ENABLE_E2E_FIXTURES — avoid reusing a server started without it.
        reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
        timeout: 180_000,
        env: {
          ...process.env,
          ENABLE_E2E_FIXTURES: '1',
        },
      },
});
