import { expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { SimWarmup } from './sim-warmup';

it('fires its practice shots one small step at a time and then is done', () => {
  const warm = new SimWarmup(loadContent());
  let steps = 0;
  while (!warm.done && steps < 5000) {
    warm.step();
    steps++;
  }
  expect(warm.done).toBe(true);
  // every shot was followed for a while (a shot that never fired would end after a few ticks)
  expect(warm.total).toBeGreaterThan(600);
  expect(warm.botFired).toBe(true);
  const at = warm.total;
  warm.step();
  expect(warm.total).toBe(at);
});
