import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

function gasCount(w: ReturnType<typeof flatWorld>, id: string): number {
  const g = w.mats.cellOf(id);
  let n = 0;
  for (let i = 0; i < w.grid.size; i++) if (w.grid.gas[i] === g) n++;
  return n;
}

describe('material.flame', () => {
  it('burning ground throws flames up into the air, and they go out', () => {
    const w = flatWorld();
    const f = w.mats.cellOf('material.fire');
    for (let x = 190; x < 200; x++) w.grid.set(x, 149, f);
    w.grid.markDirty(189, 148, 200, 150);
    w.run(20);
    expect(gasCount(w, 'material.flame')).toBeGreaterThan(3);
    // flames rise: none sits below the burning row
    const flame = w.mats.cellOf('material.flame');
    let lowest = 0;
    for (let i = 0; i < w.grid.size; i++)
      if (w.grid.gas[i] === flame) lowest = Math.max(lowest, Math.floor(i / w.grid.width));
    expect(lowest).toBeLessThanOrEqual(150);
    // shells and tanks see it as air
    for (let i = 0; i < w.grid.size; i++)
      if (w.grid.gas[i] !== 0) expect(w.grid.material[i]).toBe(0);
    w.run(400);
    expect(gasCount(w, 'material.flame')).toBe(0);
  });

  it('lights wood it licks', () => {
    const w = flatWorld();
    const wood = w.mats.cellOf('material.wood');
    for (let x = 180; x < 220; x++) for (let y = 120; y < 124; y++) w.grid.set(x, y, wood);
    const flame = w.mats.cellOf('material.flame');
    for (let x = 190; x < 210; x++) w.grid.putGas(124 * w.grid.width + x, flame);
    let lit = false;
    for (let t = 0; t < 30 && !lit; t++) {
      w.step();
      for (let x = 180; x < 220 && !lit; x++)
        if (w.grid.get(x, 123) === w.mats.cellOf('material.fire')) lit = true;
    }
    expect(lit).toBe(true);
  });
});
