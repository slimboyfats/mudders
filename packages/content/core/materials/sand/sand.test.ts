import { describe, expect, it } from 'vitest';
import { flatten, makeWorld } from '../../../src/testing';

describe('material.sand', () => {
  it('slumps a tower into a heap', () => {
    const w = makeWorld({ map: { width: 200, height: 100 } });
    flatten(w, 90);
    const sand = w.mats.cellOf('material.sand');
    for (let y = 50; y < 90; y++) for (let x = 98; x < 102; x++) w.grid.set(x, y, sand);
    w.grid.markDirty(98, 50, 101, 89);
    w.run(200);
    expect(w.grid.surfaceY(100)).toBeGreaterThan(70);
    expect(w.grid.surfaceY(90)).toBeLessThan(90);
  });

  it('is weaker than dirt against blasts', () => {
    const w = makeWorld();
    expect(w.mats.strengthOf(w.mats.cellOf('material.sand'), 0)).toBeLessThan(256);
  });
});
