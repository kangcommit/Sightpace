import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/database-setup.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
})
