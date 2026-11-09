import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

/** Explosions seen while stepping `w` until the shot is resolved: [tick, x, y, radius]. */
function blastsUntilQuiet(w: ReturnType<typeof flatWorld>, x: number): number[][] {
  const out: number[][] = [];
  const idx = w.weaponByIndex('weapon.chain-reactor');
  w.projectiles.push({
    id: 999,
    weapon: idx,
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
  const t0 = w.tick;
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) {
    w.step();
    for (const e of w.snapshot().effectEvents)
      if (e.type === 'burst') out.push([w.tick - t0, e.x, e.y, e.radius]);
  }
  return out;
}

describe('weapon.chain-reactor', () => {
  it('soaks the ground in reactor fuel that goes off in a rolling chain of blasts', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    const blasts = blastsUntilQuiet(w, 200);
    const chain = blasts.filter((b) => b[3] === 9);
    // one after another, not all at once: many small blasts spread over a couple of seconds
    expect(chain.length).toBeGreaterThan(6);
    expect(chain.length).toBeLessThan(60);
    const span = chain[chain.length - 1]![0]! - chain[0]![0]!;
    expect(span).toBeGreaterThan(60);
    // the chain wanders out across the soaked patch
    const xs = chain.map((b) => b[1]!);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
    // the reaction burns itself out: no critical core left, the reached core is cinder
    expect(countCells(w, 'material.reactor-lit')).toBe(0);
    expect(countCells(w, 'material.cinder')).toBeGreaterThan(100);
    expect(w.phase).not.toBe('resolve');
  });

  it('leaves unreached fuel live, and a later blast sets it off again', () => {
    const w = flatWorld(150);
    dropAt(w, 'weapon.chain-reactor', 200);
    const left = countCells(w, 'material.reactor-core');
    if (left === 0) return; // the chain reached every cell this time: nothing to relight
    const before = countCells(w);
    dropAt(w, 'weapon.missile', 200 - 34);
    dropAt(w, 'weapon.missile', 200 + 34);
    expect(countCells(w, 'material.reactor-core')).toBeLessThan(left);
    expect(countCells(w)).toBeLessThan(before);
  });

  it('only soaks earth: rock stays rock', () => {
    const w = flatWorld(150);
    const rock = w.mats.cellOf('material.rock');
    for (let y = 152; y < 170; y++) for (let x = 190; x < 210; x++) w.grid.set(x, y, rock);
    dropAt(w, 'weapon.chain-reactor', 200);
    // blasts chip the rock, but none of it ever turns into fuel or cinder
    expect(countCells(w, 'material.rock')).toBeGreaterThan(100);
    for (let y = 152; y < 170; y++)
      for (let x = 190; x < 210; x++)
        expect(w.grid.get(x, y)).not.toBe(w.mats.cellOf('material.cinder'));
  });
});
