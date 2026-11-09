import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { countCells, flatWorld } from '../../../src/testing';

/** Fire a Fuel-Air Bomb straight down onto column x; record each tick's puff spread and blasts. */
function drop(w: World, x: number) {
  const cloud = w.weaponByIndex('weapon.fuel-air-cloud');
  w.projectiles.push({
    id: 999,
    weapon: w.weaponByIndex('weapon.fuel-air-bomb'),
    owner: w.activePlayer,
    x: x * 65536 + 32768,
    y: (w.grid.surfaceY(x) - 6) * 65536,
    vx: 0,
    vy: 65536,
    age: 10,
    alive: true,
    data: [],
  });
  w.phase = 'resolve';
  let maxPuffs = 0;
  let minX = x;
  let maxX = x;
  const blastTicks: number[] = [];
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) {
    w.step();
    let puffs = 0;
    for (const p of w.projectiles) {
      if (p.weapon !== cloud) continue;
      puffs++;
      const px = p.x >> 16;
      // inside the map, never inside the ground
      expect(w.grid.material[(p.y >> 16) * w.grid.width + px]).toBe(0);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
    }
    maxPuffs = Math.max(maxPuffs, puffs);
    for (const e of w.snapshot().effectEvents) if (e.type === 'fireball') blastTicks.push(n);
  }
  return { maxPuffs, width: maxX - minX, blastTicks };
}

describe('weapon.fuel-air-bomb', () => {
  it('spreads a cloud of fuel over the ground, then the whole cloud goes up on one tick', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    const before = countCells(w);
    const r = drop(w, 200);
    expect(r.maxPuffs).toBe(22);
    expect(r.width).toBeGreaterThan(70);
    expect(r.blastTicks).toHaveLength(22);
    expect(new Set(r.blastTicks).size).toBe(1);
    // over a second of billowing before it ignites
    expect(r.blastTicks[0]!).toBeGreaterThan(60);
    // the crater is wide and shallow: the cloud's shape, not a round hole
    let cols = 0;
    let deepest = 0;
    for (let x = 0; x < w.grid.width; x++) {
      const d = w.grid.surfaceY(x) - 150;
      if (d > 2) cols++;
      deepest = Math.max(deepest, d);
    }
    expect(cols).toBeGreaterThan(70);
    expect(cols).toBeGreaterThan(deepest * 2);
    expect(countCells(w)).toBeLessThan(before);
  });

  it('burns tanks caught in the cloud and throws them', () => {
    const w = flatWorld(150, { tankColumns: [40, 230] });
    drop(w, 200);
    expect(w.tanks[1]!.health).toBeLessThan(50);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('drifts with the wind', () => {
    const calm = flatWorld(150, { wind: 0 });
    const windy = flatWorld(150, { wind: 0.02 });
    drop(calm, 200);
    drop(windy, 200);
    const mid = (w: World): number => {
      let s = 0;
      let n = 0;
      for (let x = 0; x < w.grid.width; x++)
        if (w.grid.surfaceY(x) > 152) {
          s += x;
          n++;
        }
      return s / n;
    };
    expect(mid(windy)).toBeGreaterThan(mid(calm) + 8);
  });
});
