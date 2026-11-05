import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'signal', environment: 'node' },
});
