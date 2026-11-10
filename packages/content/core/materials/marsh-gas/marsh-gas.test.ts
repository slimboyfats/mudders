import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.marsh-gas', () => {
  it('lingers until a flame touches it, then the whole cloud flares up', () => {
    const w = flatWorld();
    const gas = w.mats.cellOf('material.marsh-gas');
    const W = w.grid.width;
    for (let y = 100; y < 130; y++) for (let x = 150; x < 250; x++) w.grid.putGas(y * W + x, gas);
    const count = () => {
      let n = 0;
      for (let i = 0; i < w.grid.size; i++) if (w.grid.gas[i] === gas) n++;
      return n;
    };
    w.run(120);
    expect(count()).toBe(3000);
    // one spark in the middle of the cloud
    const at = 112 * W + 200;
    for (const d of [-1, 1, -W, W]) w.grid.gas[at + d] = gas;
    w.grid.gas[at] = w.mats.cellOf('material.flame');
    w.run(400);
    expect(count()).toBeLessThan(300);
  });
});
