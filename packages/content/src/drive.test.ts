import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { flatten, makeWorld } from './testing';

/** A flat calm 2-player world where player 0 (type `tank`) is up. */
function flat(tank: string | null): World {
  const w = makeWorld({
    seed: 2,
    map: { width: 800, height: 300 },
    tankColumns: [300, 700],
    tanks: [tank, null],
    turnOrder: [0, 1],
    wind: 0,
    rules: { suddenDeath: false, turnTimer: 0 },
  });
  flatten(w, 200);
  return w;
}

/** Hold drive in `dir` for `ticks` ticks; returns how far the tank moved. */
function hold(w: World, dir: -1 | 1, ticks = 600): number {
  const t = w.tanks[0]!;
  const x0 = t.x;
  w.applyInput(0, { type: 'drive', dir });
  for (let i = 0; i < ticks; i++) w.step();
  return t.x - x0;
}

describe('driving (§3.2)', () => {
  it('drives the per-turn allowance scaled by tank type, then stops', () => {
    const classic = flat('tank.classic');
    expect(hold(classic, 1)).toBe(classic.driveCells(classic.tanks[0]!));
    expect(classic.tanks[0]!.driveLeft).toBe(0);
    const scout = hold(flat('tank.scout'), -1);
    const bruiser = hold(flat('tank.bruiser'), 1);
    expect(-scout).toBe(2 * hold(flat('tank.classic'), 1));
    expect(bruiser * 2).toBe(hold(flat('tank.classic'), 1));
  });

  it('stops when released, and stays on the ground', () => {
    const w = flat(null);
    const t = w.tanks[0]!;
    w.applyInput(0, { type: 'drive', dir: 1 });
    for (let i = 0; i < 30; i++) w.step();
    w.applyInput(0, { type: 'drive', dir: 0 });
    w.step();
    const x = t.x;
    for (let i = 0; i < 60; i++) w.step();
    expect(t.x).toBe(x);
    expect(x).toBeGreaterThan(300);
    expect(t.y).toBe(200);
  });

  it('climbs a low step but not a wall', () => {
    const w = flat(null);
    const g = w.grid;
    const dirt = g.material[200 * g.width + 10]!;
    // a 2-cell step at x 320.., a 9-cell wall at x 335..
    for (let x = 320; x < 800; x++) {
      for (let y = 198; y < 200; y++) g.material[y * g.width + x] = dirt;
    }
    for (let x = 335; x < 345; x++) {
      for (let y = 189; y < 198; y++) g.material[y * g.width + x] = dirt;
    }
    const t = w.tanks[0]!;
    hold(w, 1);
    expect(t.y).toBe(198);
    expect(t.x + t.half).toBe(335);
    expect(t.driveLeft).toBeGreaterThan(0);
    expect(t.driving).toBe(0);
  });

  it('only the tank whose turn it is drives, and firing ends driving', () => {
    const w = flat(null);
    w.applyInput(1, { type: 'drive', dir: -1 });
    for (let i = 0; i < 60; i++) w.step();
    expect(w.tanks[1]!.x).toBe(700);
    w.applyInput(0, { type: 'drive', dir: 1 });
    w.step();
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect(w.tanks[0]!.driving).toBe(0);
  });

  it('burns one fuel per cell and stops when the tank runs dry', () => {
    const w = flat(null);
    const t = w.tanks[0]!;
    expect(t.fuel).toBe(w.mode.drive.startFuel);
    t.fuel = 10;
    expect(hold(w, 1)).toBe(10);
    expect(t.fuel).toBe(0);
    w.applyInput(0, { type: 'drive', dir: -1 });
    w.step();
    expect(t.driving).toBe(0);
  });

  it('a Fuel Tank in the shop adds fuel for cash, up to the cap', () => {
    const w = flat(null);
    const t = w.tanks[0]!;
    const d = w.mode.drive;
    expect(w.buyFuel(t, 1)).toBe(false); // not shop time
    w.phase = 'shop';
    t.money = d.fuelPrice * 100;
    const fuel = t.fuel;
    expect(w.buyFuel(t, 1)).toBe(true);
    expect(t.fuel).toBe(fuel + d.fuelPack);
    expect(t.money).toBe(d.fuelPrice * 99);
    while (w.buyFuel(t, 1));
    expect(t.fuel).toBe(d.fuelMax);
  });
});
