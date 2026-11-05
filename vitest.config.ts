import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      // §9: the simulation kernel keeps ≥ 80% coverage.
      provider: 'v8',
      include: ['packages/sim/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__fixtures__/**'],
      reporter: ['text-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
});
