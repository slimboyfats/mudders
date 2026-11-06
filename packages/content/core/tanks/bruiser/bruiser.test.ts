import { describe, expect, it } from 'vitest';
import { blastLoss, makeWorld } from '../../../src/testing';

describe('tank.bruiser', () => {
  it('has 150 health and a 20×12 body', () => {
    const t = makeWorld({ tanks: ['tank.bruiser'] }).tanks[0]!;
    expect([t.health, t.maxHealth, t.w, t.h]).toEqual([150, 150, 20, 12]);
  });

  it('is easier to hit: a blast that misses a Classic still catches it', () => {
    let edge = 0;
    while (blastLoss(null, 'tank.classic', edge + 1) > 0) edge++;
    expect(blastLoss(null, 'tank.classic', edge + 1)).toBe(0);
    expect(blastLoss(null, 'tank.bruiser', edge + 1)).toBeGreaterThan(0);
  });
});
