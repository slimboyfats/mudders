import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('material.rock-shade', () => {
  it('behaves exactly like rock, only its colour differs', () => {
    const w = makeWorld();
    const a = w.mats.cellOf('material.rock-shade');
    const r = w.mats.cellOf('material.rock');
    expect(a).not.toBe(r);
    for (let t = 0; t < 6; t++) expect(w.mats.strengthOf(a, t)).toBe(w.mats.strengthOf(r, t));
    expect(w.mats.settle[a]).toBe(w.mats.settle[r]);
    expect(w.mats.density[a]).toBe(w.mats.density[r]);
  });
});
