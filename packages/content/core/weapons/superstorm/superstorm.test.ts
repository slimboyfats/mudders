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

  it('stays in the sky until its last bolts have landed, then clears', () => {
    const w = world();
    // tough tanks, so the round outlasts the storm
    for (const t of w.tanks) t.health = 5000;
    dropAt(w, 'weapon.superstorm', 100, 4000);
    passTurns(w, 1);
    expect(w.zones[0]!.turns).toBe(1);
    // the last turn: the final barrage goes off with the cloud still overhead
    const idx = w.weaponByIndex('weapon.tracer');
    const t = w.tanks[w.activePlayer]!;
    t.inventory[idx] = 1;
    t.weapon = idx;
    t.angle = 90;
    t.power = 0;
    w.applyInput(w.activePlayer, { type: 'fire' });
    let boltsUnderCloud = 0;
    for (let i = 0; i < 4000 && (w.phase === 'resolve' || i === 0); i++) {
      w.step();
      for (const e of w.snapshot().effectEvents) {
        if (e.type === 'bolt' && w.zones.length > 0) boltsUnderCloud++;
      }
    }
    expect(boltsUnderCloud).toBeGreaterThan(0);
    // spent: nothing left with turns to run (it is dropped when the next turn or round begins)
    expect(w.zones.every((z) => z.turns === 0)).toBe(true);
  });
});
