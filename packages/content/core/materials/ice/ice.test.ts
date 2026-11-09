import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { countCells, dropAt, flatWorld, makeWorld, flatten } from '../../../src/testing';

/** A flat world whose ground is a slab of ice from row 150 down. */
function iceWorld(): World {
  const w = flatWorld(150, {});
  const ice = w.mats.cellOf('material.ice');
  for (let y = 150; y < 200; y++) for (let x = 100; x < 300; x++) w.grid.set(x, y, ice);
  w.grid.markDirty(100, 150, 299, 199);
  return w;
}

/** Drop a shell straight onto column x and step only `ticks` ticks (water would soak away later). */
function hit(w: World, weapon: string, x: number, ticks: number): void {
  w.projectiles.push({
    id: 1,
    weapon: w.weaponByIndex(weapon),
    owner: 0,
    x: x * 65536 + 32768,
    y: (w.grid.surfaceY(x) - 6) * 65536,
    vx: 0,
    vy: 65536,
    age: 10,
    alive: true,
    data: [],
  });
  w.phase = 'resolve';
  for (let i = 0; i < ticks; i++) w.step();
}

describe('material.ice', () => {
  it('never falls and resists a missile far better than dirt', () => {
    const w = iceWorld();
    const ice = w.mats.cellOf('material.ice');
    for (let y = 140; y < 150; y++) w.grid.set(260, y, ice);
    w.grid.markDirty(150, 100, 260, 199);
    const before = countCells(w);
    dropAt(w, 'weapon.missile', 200);
    const iceHole = before - countCells(w);
    const d = flatWorld();
    const b2 = countCells(d);
    dropAt(d, 'weapon.missile', 200);
    expect(iceHole).toBeLessThan((b2 - countCells(d)) / 2);
    expect(w.grid.get(260, 140)).toBe(ice);
  });

  it('shatters: a blast cracks the crater rim into loose shards that slide into the hole', () => {
    const w = iceWorld();
    expect(countCells(w, 'material.ice-shards')).toBe(0);
    dropAt(w, 'weapon.missile', 200);
    const shards = countCells(w, 'material.ice-shards');
    expect(shards).toBeGreaterThan(20);
    // the shards end up heaped in the crater floor, below the old surface
    const s = w.mats.cellOf('material.ice-shards');
    let deepest = 0;
    for (let y = 150; y < 200; y++) if (w.grid.get(200, y) === s) deepest = y;
    expect(deepest).toBeGreaterThan(150);
  });

  it('melts: heat turns the crater rim into water, which runs into the hole', () => {
    const w = iceWorld();
    hit(w, 'weapon.hot-napalm', 200, 40);
    expect(countCells(w, 'material.water')).toBeGreaterThan(20);
    expect(countCells(w, 'material.ice-shards')).toBe(0);
  });

  it('fire touching ice thaws it into water', () => {
    const w = iceWorld();
    const fire = w.mats.cellOf('material.fire');
    for (let x = 180; x < 220; x++) w.grid.set(x, 149, fire);
    w.grid.markDirty(179, 148, 221, 151);
    let water = 0;
    for (let i = 0; i < 60; i++) {
      w.step();
      water = Math.max(water, countCells(w, 'material.water'));
    }
    expect(water).toBeGreaterThan(0);
  });

  it('is slippery: a tank slides down an icy slope', () => {
    const w = makeWorld({ map: { width: 600, height: 300 }, tankColumns: [200, 560] });
    flatten(w, 250);
    const ice = w.mats.cellOf('material.ice');
    const g = w.grid;
    for (let x = 0; x < g.width; x++) {
      const top =
        150 + Math.min(100, Math.abs(x - 300) < 20 ? 100 : 100 - (Math.abs(x - 300) - 20));
      for (let y = top; y < 250; y++) g.material[y * g.width + x] = ice;
    }
    const t = w.tanks[0]!;
    t.y = g.surfaceY(t.x - 7);
    const x0 = t.x;
    for (let i = 0; i < 900; i++) w.step();
    expect(t.x).toBeGreaterThan(x0 + 40);
  });

  it('comes down when the ground under a sheet is dug away further than it spans', () => {
    // a 6-row sheet reaches 18: a 60-wide pit under it is too wide to bridge
    const w = iceWorld();
    const ice = w.mats.cellOf('material.ice');
    for (let y = 156; y < 200; y++) for (let x = 170; x < 230; x++) w.grid.set(x, y, 0);
    w.grid.markDirty(100, 150, 299, 199);
    w.run(600);
    let hanging = 0;
    for (let x = 190; x < 210; x++)
      for (let y = 150; y < 156; y++) if (w.grid.material[y * w.grid.width + x] === ice) hanging++;
    expect(hanging).toBe(0);
    expect(w.grid.material[150 * w.grid.width + 172]).toBe(ice); // the rim still reaches out
    expect(w.quiet).toBe(true);
  });
});
