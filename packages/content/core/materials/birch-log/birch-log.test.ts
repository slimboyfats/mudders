import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('material.birch-log', () => {
  it('is timber like birch-bark that reaches further over a gap and stays still in the wind', () => {
    const w = makeWorld();
    const a = w.mats.cellOf('material.birch-log');
    const b = w.mats.cellOf('material.birch-bark');
    for (let t = 0; t < 6; t++) expect(w.mats.strengthOf(a, t)).toBe(w.mats.strengthOf(b, t));
    expect(w.mats.settle[a]).toBe(w.mats.settle[b]);
    expect(w.mats.span[a]).toBeGreaterThan(w.mats.span[b]!);
  });
});
