import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, launchAt, passTurns } from '../../../src/testing';

const wide = { map: { width: 800, height: 300 } };

describe('terrainop.rogue-hole', () => {
  it('eats a hole where it lands and drifts away from its owner each turn', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 740] });
    dropAt(w, 'weapon.rogue-hole', 300);
    expect(w.ops).toHaveLength(1);
    const x0 = w.ops[0]!.call.x;
    expect(x0).toBeGreaterThan(300);
    expect(w.grid.material[200 * w.grid.width + x0]).toBe(0);
    passTurns(w, 1);
    expect(w.ops[0]!.call.x).toBeGreaterThan(x0 + 40);
  });

  it('swallows any shell that flies into it, its owner’s too', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 740] });
    dropAt(w, 'weapon.rogue-hole', 300);
    passTurns(w, 1);
    expect(w.activePlayer).toBe(0);
    const { x, y } = w.ops[0]!.call;
    w.snapshot();
    launchAt(w, 'weapon.missile', x - 30, y - 20, 1.5, 0);
    expect(effectsOf(w, 'holeSwallow')).toHaveLength(1);
  });

  it('bites a tank it reaches', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 420] });
    dropAt(w, 'weapon.rogue-hole', 330);
    passTurns(w, 2);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('evaporates in a pop after its rounds', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 740] });
    dropAt(w, 'weapon.rogue-hole', 300);
    passTurns(w, 6);
    expect(w.ops).toHaveLength(0);
  });
});
