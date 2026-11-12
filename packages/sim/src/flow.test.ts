import type { MaterialManifest } from '@mudders/shared';
import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { MaterialTable } from './materials';
import { settleStep } from './settle';

const mat = (
  id: string,
  cell: number,
  settle: MaterialManifest['settle'],
  more: Partial<MaterialManifest> = {},
): MaterialManifest => ({
  id,
  schemaVersion: 1,
  meta: { name: id, description: id, since: 'test@1.0.0' },
  cell,
  settle,
  density: 1,
  strength: { blast: 2 },
  cohesion: 0,
  coating: false,
  ...more,
});
const ROCK = 1;
const WATER = 2;
const mats = new MaterialTable([
  mat('material.rock', ROCK, 'static'),
  mat('material.water', WATER, 'flow', { disperse: 6, spread: 63 }),
]);

const W = 240;
const H = 120;

function box(g: Grid, x0: number, y0: number, x1: number, y1: number, m: number): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.set(x, y, m);
}
function count(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.size; i++) if (g.material[i] === WATER) n++;
  return n;
}
/** Row of the top of the water standing on the floor at row `floor` in a column. */
function top(g: Grid, x: number, floor = 100): number {
  let y = floor;
  while (y > 0 && g.material[(y - 1) * W + x] === WATER) y--;
  return y;
}
/** A tank 200 wide with its floor at row 100 and walls up to row 40. */
function tank(): Grid {
  const g = new Grid(W, H);
  box(g, 0, 40, W, H, ROCK);
  box(g, 20, 40, 220, 100, 0);
  return g;
}

describe('surfaceFlowStep (open water as columns)', () => {
  it('a dam break runs to the far wall as a wave, sloshes back and comes to rest level', () => {
    const g = tank();
    box(g, 20, 60, 70, 100, WATER);
    g.markDirty(0, 0, W - 1, H - 1);
    const n0 = count(g);
    let t = 0;
    let reached = -1;
    let highAtFarWall = 0;
    while (g.settling && t < 3000) {
      settleStep(g, mats, t++, 1e9);
      const far = 100 - top(g, 218);
      if (reached < 0 && far > 0) reached = t;
      if (far > highAtFarWall) highAtFarWall = far;
    }
    expect(g.settling).toBe(false);
    expect(t).toBeLessThan(1500);
    expect(count(g)).toBe(n0);
    // the front crosses 150 columns of dry floor in about a second and a half
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(100);
    // it arrives with speed: the water piles up against the far wall, over the level it rests at
    const level = Math.round(n0 / 200);
    expect(highAtFarWall).toBeGreaterThanOrEqual(level + 2);
    // and ends level, with no stray columns
    let lo = H;
    let hi = 0;
    for (let x = 20; x < 220; x++) {
      const y = top(g, x);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    expect(hi - lo).toBeLessThanOrEqual(2);
  });

  it('never leaves a needle of water standing over the surface', () => {
    const g = tank();
    box(g, 20, 60, 70, 100, WATER);
    g.markDirty(0, 0, W - 1, H - 1);
    let worst = 0;
    for (let t = 0; t < 400; t++) {
      settleStep(g, mats, t, 1e9);
      for (let x = 22; x < 218; x++) {
        const a = top(g, x - 1);
        const b = top(g, x);
        const c = top(g, x + 1);
        const spike = Math.min(a, c) - b;
        if (t > 20 && spike > worst) worst = spike;
      }
    }
    expect(worst).toBeLessThanOrEqual(16);
  });

  it('water over a lip falls as cells in an arc and fills the pool below', () => {
    const g = new Grid(W, H);
    box(g, 0, 100, W, H, ROCK);
    // a shelf on the left with a wall behind it, a pit to its right
    box(g, 0, 50, 80, 100, ROCK);
    box(g, 0, 10, 4, 50, ROCK);
    box(g, 200, 40, W, 100, ROCK);
    box(g, 4, 25, 60, 50, WATER);
    g.markDirty(0, 0, W - 1, H - 1);
    const n0 = count(g);
    let airborne = 0;
    let far = 0;
    let t = 0;
    // (a film left on the shelf keeps creeping here: liquids age to a stop in the world step)
    while (g.settling && t < 1500) {
      settleStep(g, mats, t++, 1e9);
      if (t % 5 !== 0) continue;
      // water in the air beside the shelf, between the lip and the floor
      let n = 0;
      for (let y = 52; y < 90; y++)
        for (let x = 80; x < 200; x++)
          if (g.material[y * W + x] === WATER && g.material[(y + 1) * W + x] === 0) {
            n++;
            if (x - 80 > far) far = x - 80;
          }
      if (n > airborne) airborne = n;
    }
    expect(count(g)).toBe(n0);
    // a real fall, thrown clear of the wall
    expect(airborne).toBeGreaterThan(20);
    expect(far).toBeGreaterThan(3);
    // most of it ends in the pit (a shallow layer stays on the wide flat shelf)
    let pit = 0;
    for (let y = 50; y < 100; y++)
      for (let x = 80; x < 200; x++) if (g.material[y * W + x] === WATER) pit++;
    expect(pit).toBeGreaterThan(n0 * 0.8);
  });

  it('is deterministic', () => {
    const run = (): number => {
      const g = tank();
      box(g, 20, 60, 70, 100, WATER);
      g.markDirty(0, 0, W - 1, H - 1);
      for (let t = 0; t < 200; t++) settleStep(g, mats, t, 1e9);
      let h = 0;
      for (let i = 0; i < g.size; i++) h = (Math.imul(h, 31) + g.material[i]! + g.flowVel[i]!) | 0;
      for (let x = 0; x < W; x++) h = (Math.imul(h, 31) + g.surfVel[x]! + g.surfAcc[x]!) | 0;
      return h;
    };
    expect(run()).toBe(run());
  });
});
