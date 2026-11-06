import { describe, expect, it } from 'vitest';
import { blastLoss, makeWorld } from '../../../src/testing';

describe('tank.howitzer', () => {
  it('has 80 health', () => {
    expect(makeWorld({ tanks: ['tank.howitzer'] }).tanks[0]!.health).toBe(80);
  });

  it('its shells hit about 30% harder than a Classic', () => {
    const base = blastLoss('tank.classic', 'tank.bruiser', 14);
    const big = blastLoss('tank.howitzer', 'tank.bruiser', 14);
    expect(base).toBeGreaterThan(10);
    expect(big).toBeGreaterThanOrEqual(Math.trunc(base * 1.25));
    expect(big).toBeLessThanOrEqual(Math.ceil(base * 1.35));
  });
});
