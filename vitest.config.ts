import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', 'node_modules', 'dist', '.git'],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
  },
});