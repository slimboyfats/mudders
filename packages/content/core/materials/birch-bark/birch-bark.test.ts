import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('material.birch-bark', () => {
  it('behaves like wood, apart from its colour and how it sways', () => {
    const w = makeWorld();
    const a = w.mats.cellOf('material.birch-bark');
    const b = w.mats.cellOf('material.wood');
    expect(a).not.toBe(b);
    for (let t = 0; t < 6; t++) expect(w.mats.strengthOf(a, t)).toBe(w.mats.strengthOf(b, t));
    expect(w.mats.settle[a]).toBe(w.mats.settle[b]);
    expect(w.mats.density[a]).toBe(w.mats.density[b]);
  });
});
