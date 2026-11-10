import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.gas-flare', () => {
  it('burns out fast, lights wood and hurts a tank inside it', () => {
    const w = flatWorld();
    const flare = w.mats.cellOf('material.gas-flare');
    const wood = w.mats.cellOf('material.wood');
    const W = w.grid.width;
    for (let x = 180; x < 220; x++) w.grid.set(x, 140, wood);
    for (let y = 130; y < 140; y++) for (let x = 180; x < 220; x++) w.grid.putGas(y * W + x, flare);
    w.run(4);
    let fire = 0;
    for (let x = 180; x < 220; x++)
      if (w.grid.get(x, 140) === w.mats.cellOf('material.fire')) fire++;
    expect(fire).toBeGreaterThan(0);
    w.run(120);
    let left = 0;
    for (let i = 0; i < w.grid.size; i++) if (w.grid.gas[i] === flare) left++;
    expect(left).toBe(0);
  });
});
