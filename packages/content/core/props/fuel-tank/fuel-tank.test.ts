import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatten, propWorld } from '../../../src/testing';

/** Fuel (lit or not) lying outside the tank's own columns. */
function spilt(w: World): number {
  const g = w.grid;
  const fuel = w.mats.cellOf('material.fuel');
  const burning = w.mats.cellOf('material.burning-fuel');
  let n = 0;
  for (let y = 0; y < 150; y++)
    for (let x = 0; x < g.width; x++) {
      if (x >= 182 && x <= 218) continue;
      const m = g.material[y * g.width + x]!;
      if (m === fuel || m === burning) n++;
    }
  return n;
}

describe('prop.fuel-tank', () => {
  it('stands full of fuel and stays still', () => {
    const w = propWorld('prop.fuel-tank', 200);
    const fuel = countCells(w, 'material.fuel');
    expect(fuel).toBeGreaterThan(300);
    w.run(200);
    expect(countCells(w, 'material.fuel')).toBe(fuel);
    expect(w.quiet).toBe(true);
  });

  it('goes up when hit: the vapour blows, the fuel lights, runs out burning and burns away', () => {
    const w = propWorld('prop.fuel-tank', 200);
    flatten(w, 150, 'material.rock');
    w.groups.placeAt(w.grid, 'prop.fuel-tank', 200);
    w.grid.clearSettle();
    w.grid.clearReact();
    const fuel = countCells(w, 'material.fuel');
    dropAt(w, 'weapon.missile', 196, 1);
    let burning = 0;
    let out = 0;
    let bursts = 0;
    w.snapshot();
    for (let t = 0; t < 600; t++) {
      w.step();
      burning = Math.max(burning, countCells(w, 'material.burning-fuel'));
      bursts += w.snapshot().effectEvents.filter((e) => e.type === 'pocketBurst').length;
      out = Math.max(out, spilt(w));
    }
    expect(bursts).toBeGreaterThanOrEqual(1);
    expect(countCells(w, 'material.fuel-vapour')).toBe(0);
    expect(burning).toBeGreaterThan(20);
    expect(out).toBeGreaterThan(10);
    expect(countCells(w, 'material.fuel')).toBeLessThan(fuel / 4);
  });
});
