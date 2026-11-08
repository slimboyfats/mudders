import { describe, expect, it } from 'vitest';
import { KINDS } from './gpu-particles';
import { PKind } from './particles';

describe('GPU particle kinds', () => {
  it('has one physics row per kind', () => {
    expect(KINDS.length).toBe(Object.keys(PKind).length);
  });

  it('keeps the CPU model motion for each kind', () => {
    const spark = KINDS[PKind.Spark]!;
    expect([spark.gravity, spark.dragX, spark.dragY]).toEqual([0.6, 0.97, 0.97]);
    expect(KINDS[PKind.Snow]!.maxFall).toBe(0.32);
    expect(KINDS[PKind.Smoke]!.lift).toBe(0.012);
  });

  it('lets falling debris land, and wind streaks fly through hills', () => {
    for (const k of [PKind.Spark, PKind.Chunk, PKind.Snow, PKind.Glitter]) {
      expect(KINDS[k]!.collide).toBe(true);
    }
    expect(KINDS[PKind.Streak]!.collide).toBe(false);
    expect(KINDS[PKind.Dust]!.collide).toBe(false);
  });

  it('stays bounded: bounces lose speed and drag never adds it', () => {
    for (const k of KINDS) {
      expect(k.bounce).toBeLessThan(1);
      expect(k.dragX).toBeLessThanOrEqual(1);
      expect(k.dragY).toBeLessThanOrEqual(1);
    }
  });
});
