import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatten, makeWorld } from '../../../src/testing';

function flatWorld() {
  const w = makeWorld({
    map: { width: 800, height: 300 },
    tankColumns: [100, 700],
    wind: 0,
    turnOrder: [0, 1],
  });
  flatten(w, 200);
  return w;
}

describe('terrainop.dirt-tsunami', () => {
  it('rolls a crest of the ground away from the shooter over many ticks', () => {
    const w = flatWorld();
    const before = countCells(w);
    let peakX = 0;
    let peakH = 0;
    let fired = false;
    // step by hand to watch the crest move
    const idx = w.weaponByIndex('weapon.dirt-tsunami');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 300 * 65536 + 32768,
      y: 190 * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    let ticks = 0;
    const seen: number[] = [];
    while (ticks < 3000 && w.phase === 'resolve') {
      w.step();
      ticks++;
      if (ticks % 30 === 0) {
        let best = 300;
        let bestH = 0;
        for (let x = 0; x < w.grid.width; x++) {
          const h = 200 - w.grid.surfaceY(x);
          if (h > bestH) {
            bestH = h;
            best = x;
          }
        }
        if (bestH > peakH) peakH = bestH;
        if (bestH >= 8) seen.push(best);
        peakX = best;
        fired = true;
      }
    }
    expect(fired).toBe(true);
    // the crest stood well above the ground and marched rightward (away from tank 0 at x=100)
    expect(peakH).toBeGreaterThanOrEqual(15);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen[seen.length - 1]!).toBeGreaterThan(seen[0]! + 60);
    expect(peakX).toBeGreaterThan(400);
    // terrain is moved, not made: only the small blast and the map edges can lose cells
    const after = countCells(w);
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(before - 1200);
  });

  it('scours a trough along its path and heaps the dirt where it crashes', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.dirt-tsunami', 300);
    const g = w.grid;
    // ground along the path is lower than it was ...
    for (let x = 320; x < 330; x++) expect(g.surfaceY(x)).toBeGreaterThan(200);
    // ... and there is a heap well beyond the impact, near the end of the run
    let heapX = 0;
    let heapTop = 200;
    for (let x = 320; x < g.width; x++) {
      if (g.surfaceY(x) < heapTop) {
        heapTop = g.surfaceY(x);
        heapX = x;
      }
    }
    expect(heapTop).toBeLessThan(194);
    expect(heapX).toBeGreaterThan(560);
  });

  it('stops at a rock wall taller than the crest', () => {
    const w = flatWorld();
    const g = w.grid;
    const rock = w.mats.cellOf('material.rock');
    for (let y = 120; y < 200; y++)
      for (let x = 480; x < 500; x++) g.material[y * g.width + x] = rock;
    dropAt(w, 'weapon.dirt-tsunami', 300);
    // nothing got over the wall
    for (let x = 520; x < 700; x++) expect(g.surfaceY(x)).toBe(200);
  });
});
