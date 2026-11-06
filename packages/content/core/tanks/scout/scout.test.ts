import { describe, expect, it } from 'vitest';
import { blastLoss, makeWorld } from '../../../src/testing';

describe('tank.scout', () => {
  it('has 70 health and a tiny 12×7 body', () => {
    const t = makeWorld({ tanks: ['tank.scout'] }).tanks[0]!;
    expect([t.health, t.w, t.h]).toEqual([70, 12, 7]);
  });

  it('is harder to hit: the edge of a blast that grazes a Classic misses it', () => {
    let edge = 0;
    while (blastLoss(null, 'tank.classic', edge + 1) > 0) edge++;
    expect(blastLoss(null, 'tank.classic', edge)).toBeGreaterThan(0);
    expect(blastLoss(null, 'tank.scout', edge)).toBe(0);
  });
});
