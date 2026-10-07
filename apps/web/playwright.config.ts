import { existsSync } from 'fs';
import { defineConfig } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 4173;
const testDb = process.env.TEST_DATABASE_URL ?? 'postgresql://bange:bange_dev@localhost:5432/bange_agenda_test?schema=public';
// Si el navegador preinstalado no coincide con la versión de Playwright, usar PW_CHROMIUM_PATH.
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', launchOptions: { executablePath } },
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT), DATABASE_URL: testDb, NODE_ENV: 'production',
        JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456', CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        LOGIN_RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_PER_MINUTE: '100000',
      },
    },
    {
      command: `npx vite build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
