import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld, passTurns } from '../../../src/testing';

function world() {
  return flatWorld(150, { tankColumns: [40, 360] });
}

describe('weapon.superstorm', () => {
  it('hangs one storm over the whole map, and rusts every tank', () => {
    const w = world();
    dropAt(w, 'weapon.superstorm', 100, 4000);
    const z = w.zones[0]!;
    expect(w.zones.length).toBe(1);
    expect(z.x).toBe(200);
    expect(z.radius).toBeGreaterThan(200);
    // hangs 50 cells over the highest ground (the flat surface is row 150)
    expect(z.y).toBe(100);
    for (const t of w.tanks) expect(t.rust).toBeGreaterThan(0);
  });

  it('a barrage of bolts rolls down one after another at the end of the turn', () => {
    const w = world();
    const ticks: number[] = [];
    dropAt(w, 'weapon.superstorm', 100, 4000);
    passTurns(w, 0);
    // run the next turn and log when the bolts go off
    const t0 = w.tick;
    const idx = w.weaponByIndex('weapon.tracer');
    const t = w.tanks[w.activePlayer]!;
    t.inventory[idx] = 1;
    t.weapon = idx;
    t.angle = 90;
    t.power = 0;
    w.applyInput(w.activePlayer, { type: 'fire' });
    while (w.tick < t0 + 4000) {
      w.step();
      for (const e of w.snapshot().effectEvents) if (e.type === 'bolt') ticks.push(w.tick);
      if (w.phase === 'aim') break;
    }
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    // they roll: not all on one tick
    expect(new Set(ticks).size).toBeGreaterThan(2);
  });

  it('clears after three turns', () => {
    const w = world();
    dropAt(w, 'weapon.superstorm', 100, 4000);
    passTurns(w, 3);
    expect(w.zones.length).toBe(0);
  });
});
