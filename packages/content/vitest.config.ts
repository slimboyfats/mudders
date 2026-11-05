import { defineProject } from 'vitest/config';

// Content tests run whole matches on full-size maps; under coverage with every file in parallel a
// few take several seconds, so allow more than vitest's 5 s default.
export default defineProject({
  test: { name: 'content', environment: 'node', testTimeout: 30_000 },
});
