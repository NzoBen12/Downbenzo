import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://bange:bange_dev@localhost:5432/bange_agenda_test?schema=public',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
      RATE_LIMIT_PER_MINUTE: '100000',
      LOGIN_RATE_LIMIT_PER_MINUTE: '100000',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
