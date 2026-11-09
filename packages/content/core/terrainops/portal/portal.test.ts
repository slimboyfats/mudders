import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld, passTurns } from '../../../src/testing';

const wide = { map: { width: 800, height: 240 }, tankColumns: [60, 700] };

/** Rings at A = 400 (where the shell lands) and B = 60 + near (108), both on the ground at 150. */
function opened() {
  const w = flatWorld(150, wide);
  dropAt(w, 'weapon.portal-pair', 400);
  return w;
}

describe('terrainop.portal', () => {
  it('opens its twin a short way in front of the shooter, both standing on the ground', () => {
    const w = opened();
    const d = w.ops[0]!.data;
    expect(d[3]).toBe(400);
    expect(d[5]).toBe(108);
    expect(d[4]).toBe(149 - 16);
    expect(d[6]).toBe(149 - 16);
  });

  it('a shell flown into one ring comes out of the other with the same velocity', () => {
    const w = opened();
    const cells = countCells(w);
    // a level shot through ring B, heading right: it reappears at A and flies on to the right
    let seen = false;
    const idx = w.weaponByIndex('weapon.missile');
    w.projectiles.push({
      id: 77,
      weapon: idx,
      owner: 0,
      x: 90 * 65536,
      y: 133 * 65536,
      vx: 3 * 65536,
      vy: 0,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let n = 0; n < 400 && w.phase === 'resolve'; n++) {
      w.step();
      for (const s of w.projectiles) {
        if (s.alive && s.x >= 395 * 65536 && s.x <= 420 * 65536) {
          seen = true;
          expect(s.vx).toBeGreaterThan(2 * 65536);
        }
      }
    }
    expect(seen).toBe(true);
    // no crater anywhere near ring B: it went off past ring A
    expect(cells - countCells(w)).toBeGreaterThan(0);
    expect(w.grid.material[151 * w.grid.width + 130]).not.toBe(0);
  });

  it('a tank that drives into a ring steps out beside the other, going the same way', () => {
    const w = opened();
    const t = w.tanks[0]!;
    // walk it into ring B from the left, a cell a tick, the way driving moves it
    let moved = false;
    for (let x = t.x; x <= 112 && !moved; x++) {
      t.x = x;
      w.step();
      if (t.x > 300) moved = true;
    }
    expect(moved).toBe(true);
    expect(t.x).toBeGreaterThan(400 + 8);
    expect(t.x).toBeLessThan(440);
    expect(t.y).toBe(150);
    expect(t.health).toBe(100);
    expect(effectsOf(w, 'portalPass').length).toBeGreaterThan(0);
  });

  it('shuts after three full rounds of turns', () => {
    const w = opened();
    passTurns(w, 5);
    expect(w.ops).toHaveLength(1);
    passTurns(w, 2);
    for (let n = 0; n < 60; n++) w.step();
    expect(w.ops).toHaveLength(0);
  });
});
