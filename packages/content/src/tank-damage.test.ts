import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { countCells, dropAt, flatWorld } from './testing';

/**
 * Tanks with weight (`rules.tankDamage`, kernel 0.68.0): a tank at or under a quarter of its
 * health is crippled. Its tracks are broken (half the drive) and its fuel tank leaks oil.
 */

const RULES = { turnTimer: 0, suddenDeath: false };
const on = (): World => flatWorld(150, { rules: { ...RULES, tankDamage: true } });

/** Drive the active tank `dir` until it stops; returns the cells it moved. */
function drive(w: World, dir: -1 | 1): number {
  const t = w.tanks[w.activePlayer]!;
  const x0 = t.x;
  w.applyInput(t.player, { type: 'drive', dir });
  w.step();
  for (let i = 0; i < 600 && t.driving !== 0; i++) w.step();
  return Math.abs(t.x - x0);
}

describe('tanks with weight', () => {
  it('off unless the rule is set', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    t.health = 30;
    dropAt(w, 'weapon.missile', t.x - 18);
    expect(t.alive).toBe(true);
    expect(t.health).toBeLessThan(25);
    expect(w.crippled(t)).toBe(false);
    expect(countCells(w, 'material.oil')).toBe(0);
    expect(w.driveCells(t)).toBe(w.driveCells(w.tanks[0]!));
  });

  it('a tank knocked under a quarter of its health is crippled once and spills oil', () => {
    const w = on();
    const t = w.tanks[1]!;
    t.health = 30;
    dropAt(w, 'weapon.missile', t.x - 18);
    expect(t.alive).toBe(true);
    expect(w.crippled(t)).toBe(true);
    const ev = w.snapshot().effectEvents.filter((e) => e.type === 'crippled');
    expect(ev.length).toBe(1);
    const oil = countCells(w, 'material.oil') + countCells(w, 'material.burning-oil');
    expect(oil).toBeGreaterThan(0);
    expect(oil).toBeLessThanOrEqual(6);
    // broken tracks: half the cells a turn
    expect(w.driveCells(t)).toBe(Math.trunc(w.driveCells(w.tanks[0]!) / 2));
  });

  it('a healthy tank that is hit but stays over the line does not leak', () => {
    const w = on();
    const t = w.tanks[1]!;
    dropAt(w, 'weapon.missile', t.x - 18);
    expect(t.health).toBeLessThan(t.maxHealth);
    expect(w.crippled(t)).toBe(false);
    expect(countCells(w, 'material.oil')).toBe(0);
  });

  it('a crippled tank drives half as far and leaves an oil trail behind it', () => {
    const whole = on();
    const far = drive(whole, 1);
    expect(far).toBeGreaterThan(10);
    expect(countCells(whole, 'material.oil')).toBe(0);
    const w = on();
    const t = w.tanks[0]!;
    t.health = 20;
    t.driveLeft = w.driveCells(t);
    const near = drive(w, 1);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(Math.ceil(far / 2));
    const oil = countCells(w, 'material.oil');
    expect(oil).toBeGreaterThanOrEqual(Math.floor(near / 3) - 1);
    expect(oil).toBeGreaterThan(0);
    // the trail lies behind the tank, not ahead of it
    const g = w.grid;
    const c = w.mats.cellOf('material.oil');
    for (let i = 0; i < g.material.length; i++) {
      if (g.material[i] === c) expect(i % g.width).toBeLessThan(t.x);
    }
  });
});
