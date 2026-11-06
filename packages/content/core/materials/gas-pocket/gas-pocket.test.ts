import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

/** Flat dirt with a gas pocket buried at (cx, cy), `rx` × `ry`. */
function pocketWorld(cx: number, cy: number, rx = 8, ry = 4) {
  const w = flatWorld();
  const gas = w.mats.cellOf('material.gas-pocket');
  for (let y = cy - ry; y <= cy + ry; y++)
    for (let x = cx - rx; x <= cx + rx; x++) w.grid.set(x, y, gas);
  w.grid.clearSettle();
  w.grid.clearReact();
  return w;
}

describe('material.gas-pocket', () => {
  it('lies quiet while buried', () => {
    const w = pocketWorld(200, 170);
    w.grid.markDirty(150, 140, 250, 190);
    w.run(200);
    expect(countCells(w, 'material.gas-pocket')).toBe(17 * 9);
  });

  it('bursts all at once when a crater uncovers it, blowing a far bigger hole', () => {
    const plain = flatWorld();
    const lost0 = countCells(plain);
    dropAt(plain, 'weapon.baby-missile', 200);
    const plainLoss = lost0 - countCells(plain);

    const w = pocketWorld(200, 160);
    const n0 = countCells(w);
    w.snapshot();
    dropAt(w, 'weapon.baby-missile', 200);
    expect(countCells(w, 'material.gas-pocket')).toBe(0);
    expect(effectsOf(w, 'pocketBurst').length).toBe(1);
    expect(n0 - countCells(w)).toBeGreaterThan(plainLoss * 3);
    expect(countCells(w, 'material.scorch')).toBeGreaterThan(0);
  });

  it('chains: one burst uncovers the next pocket', () => {
    const w = pocketWorld(200, 160);
    const gas = w.mats.cellOf('material.gas-pocket');
    for (let y = 166; y < 172; y++) for (let x = 216; x < 232; x++) w.grid.set(x, y, gas);
    w.snapshot();
    dropAt(w, 'weapon.baby-missile', 200);
    expect(countCells(w, 'material.gas-pocket')).toBe(0);
    expect(effectsOf(w, 'pocketBurst').length).toBe(2);
  });

  it('hurts a tank standing over it, credited to the shooter', () => {
    const w = pocketWorld(360, 160);
    const t = w.tanks[1]!;
    const hp = t.health;
    dropAt(w, 'weapon.baby-missile', 345);
    expect(t.health).toBeLessThan(hp - 20);
  });
});
