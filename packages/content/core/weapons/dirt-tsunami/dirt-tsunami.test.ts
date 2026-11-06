import { describe, expect, it } from 'vitest';
import { dropAt, flatten, makeWorld } from '../../../src/testing';

function flatWorld(tank1: number) {
  const w = makeWorld({
    map: { width: 800, height: 300 },
    tankColumns: [100, tank1],
    wind: 0,
    turnOrder: [0, 1],
  });
  flatten(w, 200);
  return w;
}

describe('weapon.dirt-tsunami', () => {
  it('picks up a tank in its path, carries it along and drops it where it crashes', () => {
    const w = flatWorld(420);
    const hp = w.tanks[1]!.health;
    dropAt(w, 'weapon.dirt-tsunami', 300);
    const t = w.tanks[1]!;
    // shoved well down the line, away from the shooter
    expect(t.x).toBeGreaterThan(520);
    // the fall off the crest hurts
    expect(t.health).toBeLessThan(hp);
  });

  it('runs away from the shooter whichever side it is on', () => {
    const w = flatWorld(700);
    w.tanks[0]!.x = 600;
    w.tanks[1]!.x = 100;
    const before = w.grid.surfaceY(150);
    dropAt(w, 'weapon.dirt-tsunami', 450);
    // the main wave went left, so the ground there has been scoured or heaped, not left alone
    let changed = 0;
    for (let x = 200; x < 400; x++) if (w.grid.surfaceY(x) !== 200) changed++;
    expect(changed).toBeGreaterThan(100);
    expect(before).toBe(200);
  });
});
