import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld, passTurns } from '../../../src/testing';

/** Two tanks on a flat 400-wide map (surface row 150); tank 1 sits at column 300. */
function world() {
  return flatWorld(150, { tankColumns: [60, 300] });
}

/** Run turns, collecting every effect event of the given types along the way. */
function turnsWithEvents(w: ReturnType<typeof world>, turns: number, types: string[]) {
  const out: { type: string; x: number; y: number; params: Readonly<Record<string, number>> }[] =
    [];
  const drain = () => {
    for (const e of w.snapshot().effectEvents) {
      if (types.includes(e.type)) out.push({ type: e.type, x: e.x, y: e.y, params: e.params });
    }
  };
  for (let k = 0; k < turns; k++) {
    passTurns(w, 1);
    drain();
  }
  return out;
}

describe('weapon.thunderstorm', () => {
  it('hangs a storm cloud in the sky over the impact for four turns', () => {
    const w = world();
    dropAt(w, 'weapon.thunderstorm', 300);
    const z = w.zones[0]!;
    expect(w.zones.length).toBe(1);
    expect(z.look).toBe(5);
    expect(z.x).toBeGreaterThan(290);
    expect(z.x).toBeLessThan(310);
    // above the ground (row 150), well clear of the crater
    expect(z.y).toBeLessThan(100);
    expect(z.turns).toBe(3);
    passTurns(w, 3);
    expect(w.zones.length).toBe(0);
  });

  it('rusts the tanks under the cloud, and only those', () => {
    const w = world();
    dropAt(w, 'weapon.thunderstorm', 330);
    expect(w.tanks[1]!.rust).toBe(3);
    expect(w.tanks[0]!.rust).toBe(0);
    expect(w.snapshot().entities.some((e) => e.kind === 'tank' && e.rust === 3)).toBe(true);
  });

  it('a rusted tank drives half as far, and the rust eats health each own turn', () => {
    const w = world();
    const full = w.driveCells(w.tanks[1]!);
    dropAt(w, 'weapon.thunderstorm', 330);
    const t = w.tanks[1]!;
    expect(w.activePlayer).toBe(1);
    expect(t.driveLeft).toBe(Math.trunc(full / 2));
    // stop the storm so only the rust is at work
    w.zones.length = 0;
    const hp = t.health;
    const dealt = w.tanks[0]!.damageDealt;
    passTurns(w, 1);
    expect(t.health).toBe(hp - 6);
    expect(t.rust).toBe(2);
    // the storm's owner is credited
    expect(w.tanks[0]!.damageDealt).toBe(dealt + 6);
    passTurns(w, 2);
    expect(t.rust).toBe(1);
    passTurns(w, 2);
    expect(t.rust).toBe(0);
    expect(t.health).toBe(hp - 18);
    passTurns(w, 1);
    expect(w.activePlayer).toBe(1);
    expect(t.driveLeft).toBe(full);
  });

  it('a rusted barrel makes shots wobble', () => {
    const shot = (rusty: boolean, seed: number) => {
      const w = flatWorld(150, { tankColumns: [60, 300], seed });
      const t = w.tanks[0]!;
      if (rusty) {
        t.rust = 2;
        t.rustWobble = 5;
        t.rustDrive = 500;
      }
      t.angle = 60;
      t.power = 500;
      t.weapon = w.weaponByIndex('weapon.missile');
      t.inventory[t.weapon] = 1;
      w.applyInput(0, { type: 'fire' });
      w.step();
      const p = w.projectiles[0]!;
      return `${p.vx},${p.vy}`;
    };
    const clean = new Set([1, 2, 3, 4, 5].map((s) => shot(false, s)));
    const rusty = new Set([1, 2, 3, 4, 5].map((s) => shot(true, s)));
    expect(clean.size).toBe(1);
    expect(rusty.size).toBeGreaterThan(2);
  });

  it('lightning cracks down out of the cloud on later turns and glasses the ground', () => {
    const w = world();
    dropAt(w, 'weapon.thunderstorm', 200);
    const glass = countCells(w, 'material.fulgurite');
    const bolts = turnsWithEvents(w, 4, ['bolt']).filter((b) => b.params.storm === 1);
    expect(bolts.length).toBeGreaterThan(0);
    for (const b of bolts) {
      expect(Math.abs(b.x - 200)).toBeLessThanOrEqual(46);
      expect(b.params.top).toBeLessThan(b.y);
    }
    expect(countCells(w, 'material.fulgurite')).toBeGreaterThan(glass);
  });
});
