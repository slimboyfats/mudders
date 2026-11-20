import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { dropAt, flatWorld, launchAt } from './testing';

/**
 * Blast cover (`rules.cover`, kernel 0.62.0): solid ground between a blast and a tank soaks up
 * part of the damage, by how thick and how heavy it is, and a blast shut in by ground reaches
 * further along the opening it has.
 */

const RULES = { turnTimer: 0, suddenDeath: false };

/** A wall of `material` on the flat ground, `rows` high, over columns [x0, x1]. */
function wall(w: World, x0: number, x1: number, rows: number, material = 'material.dirt'): void {
  const c = w.mats.cellOf(material);
  const top = w.tanks[1]!.y - rows;
  for (let y = top; y < w.tanks[1]!.y; y++) for (let x = x0; x <= x1; x++) w.grid.set(x, y, c);
  w.grid.clearSettle();
}

/** Damage tank 1 (column 360) takes from a Missile landing at column `x`. */
function hit(w: World, x: number): number {
  const t = w.tanks[1]!;
  const hp = t.health;
  dropAt(w, 'weapon.missile', x);
  return hp - t.health;
}

describe('blast cover', () => {
  it('off unless the rule is set: a wall changes nothing', () => {
    const open = flatWorld();
    const walled = flatWorld();
    wall(walled, 366, 375, 24, 'material.rock');
    expect(hit(open, 382)).toBeGreaterThan(0);
    expect(hit(walled, 365)).toBeGreaterThan(0);
    const a = flatWorld();
    const b = flatWorld();
    wall(b, 368, 377, 24, 'material.rock');
    // a Missile on the far side of the wall: the same hit as with no wall at all
    expect(hit(b, 379)).toBe(hit(a, 379));
  });

  it('a tank in the open is hit in full', () => {
    const off = flatWorld();
    const on = flatWorld(150, { rules: { ...RULES, cover: true } });
    expect(hit(on, 375)).toBe(hit(off, 375));
  });

  it('a wall between the blast and the tank soaks up part of it, rock more than dirt', () => {
    const open = flatWorld(150, { rules: { ...RULES, cover: true } });
    const dirt = flatWorld(150, { rules: { ...RULES, cover: true } });
    const rock = flatWorld(150, { rules: { ...RULES, cover: true } });
    wall(dirt, 368, 377, 24);
    wall(rock, 368, 377, 24, 'material.rock');
    const full = hit(open, 379);
    const behindDirt = hit(dirt, 379);
    const behindRock = hit(rock, 379);
    expect(full).toBeGreaterThan(10);
    expect(behindDirt).toBeLessThan(full);
    expect(behindRock).toBeLessThan(behindDirt);
    // never less than the floor
    expect(behindRock).toBeGreaterThanOrEqual(Math.floor((full * 30) / 100) - 1);
    expect(rock.snapshot().effectEvents.some((e) => e.type === 'cover')).toBe(true);
  });

  it('a blast shut in a tunnel reaches further along it than one in the open', () => {
    // a rock roof over the ground from column 250 to the right edge, 12 cells of air under it
    const tunnel = flatWorld(150, { rules: { ...RULES, cover: true } });
    const rock = tunnel.mats.cellOf('material.rock');
    for (let y = 100; y < 138; y++) for (let x = 250; x < 400; x++) tunnel.grid.set(x, y, rock);
    tunnel.grid.clearSettle();
    const open = flatWorld(150, { rules: { ...RULES, cover: true } });
    const shut = tunnel.tanks[1]!.health;
    const free = open.tanks[1]!.health;
    // a Missile goes off on the floor about 35 cells short of the tank, past its reach of 32
    launchAt(tunnel, 'weapon.missile', 322, 146, 1, 1);
    launchAt(open, 'weapon.missile', 322, 146, 1, 1);
    expect(free - open.tanks[1]!.health).toBe(0);
    expect(shut - tunnel.tanks[1]!.health).toBeGreaterThan(0);
  });

  it('a tank that shows over a low wall is not covered', () => {
    const open = flatWorld(150, { rules: { ...RULES, cover: true } });
    const low = flatWorld(150, { rules: { ...RULES, cover: true } });
    wall(low, 368, 377, 3);
    expect(hit(low, 379)).toBe(hit(open, 379));
  });
});
