import { describe, expect, it } from 'vitest';
import { flatten, makeWorld } from '../../../src/testing';
import gasCloud from './behaviour';

describe('terrainop.gas-cloud', () => {
  it('fills air in a disc with gas and leaves the ground alone', () => {
    const w = makeWorld({ map: { width: 200, height: 100 } });
    flatten(w, 60);
    const ground = w.grid.material.slice();
    const params = gasCloud.params.parse({ gas: 'material.marsh-gas', fill: 0.5 });
    gasCloud.start(w, params, {
      x: 100,
      y: 60,
      radius: 10,
      damageType: 'heat',
      damageTypeIndex: 0,
      owner: 0,
    });
    let n = 0;
    for (let i = 0; i < w.grid.size; i++) {
      if (w.grid.gas[i] !== 0) {
        n++;
        expect(w.grid.material[i]).toBe(0);
      }
    }
    // about half of the upper half disc (~157 air cells)
    expect(n).toBeGreaterThan(40);
    expect(n).toBeLessThan(130);
    expect(w.grid.material).toEqual(ground);
  });
});
