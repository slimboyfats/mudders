import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { flatWorld, flatten, launchAt } from './testing';

/**
 * Shells and materials (`rules.shells`, kernel 0.63.0, `shellContact`): a plain shell glances off
 * hard ground on a flat hit, skips on water when fast and flat, and buries itself in soft ground.
 */

const RULES = { turnTimer: 0, suddenDeath: false };

function world(shells: boolean, ground: string): World {
  const w = flatWorld(150, { rules: { ...RULES, shells }, tankColumns: [20, 380] });
  flatten(w, 150, ground);
  w.grid.clearSettle();
  return w;
}

/** Fire a Missile from (x, y) and say where it went off. */
function shot(w: World, x: number, y: number, vx: number, vy: number): { x: number; y: number } {
  launchAt(w, 'weapon.missile', x, y, vx, vy);
  const t = w.tanks[0]!;
  return { x: t.lastShotX, y: t.lastShotY };
}

describe('shells and materials', () => {
  it('off unless the rule is set: a flat hit on rock goes off where it lands', () => {
    const w = world(false, 'material.rock');
    const hit = shot(w, 60, 140, 5, 1);
    expect(hit.y).toBe(150);
    expect(hit.x).toBeLessThan(125);
  });

  it('glances off rock on a flat hit, once, and comes down further on', () => {
    const off = shot(world(false, 'material.rock'), 60, 140, 5, 1);
    const w = world(true, 'material.rock');
    const on = shot(w, 60, 140, 5, 1);
    expect(on.x).toBeGreaterThan(off.x + 10);
    expect(on.y).toBe(150);
    expect(w.snapshot().effectEvents.filter((e) => e.type === 'ricochet')).toHaveLength(1);
  });

  it('a square hit on rock goes off as ever, and so does a flat hit on dirt', () => {
    expect(shot(world(true, 'material.rock'), 100, 120, 1, 5)).toEqual(
      shot(world(false, 'material.rock'), 100, 120, 1, 5),
    );
    expect(shot(world(true, 'material.dirt'), 60, 140, 5, 1)).toEqual(
      shot(world(false, 'material.dirt'), 60, 140, 5, 1),
    );
  });

  it('skips on water when fast and flat, at most twice', () => {
    const off = shot(world(false, 'material.water'), 60, 140, 6, 1);
    const w = world(true, 'material.water');
    const on = shot(w, 60, 140, 6, 1);
    expect(on.x).toBeGreaterThan(off.x + 10);
    const rings = w.snapshot().effectEvents.filter((e) => e.type === 'ripple');
    expect(rings.length).toBeGreaterThanOrEqual(1);
    expect(rings.length).toBeLessThanOrEqual(2);
    // a steep shell goes off on the surface
    expect(shot(world(true, 'material.water'), 100, 120, 1, 5)).toEqual(
      shot(world(false, 'material.water'), 100, 120, 1, 5),
    );
  });

  it('buries itself in snow before it goes off, deeper than in sand, and not at all in dirt', () => {
    const snow = shot(world(true, 'material.snow'), 200, 120, 0, 5);
    const sand = shot(world(true, 'material.sand'), 200, 120, 0, 5);
    const dirt = shot(world(true, 'material.dirt'), 200, 120, 0, 5);
    expect(dirt.y).toBe(150);
    expect(sand.y).toBe(153);
    expect(snow.y).toBe(158);
    expect(shot(world(false, 'material.snow'), 200, 120, 0, 5).y).toBe(150);
  });

  it('the aim predictor follows a glance and changes nothing in the world', () => {
    const land = (shells: boolean): number => {
      const w = world(shells, 'material.rock');
      const before = w.hash();
      const p = w.predict(w.tanks[0]!, w.weaponByIndex('weapon.missile'), 8, 600);
      expect(w.hash()).toBe(before);
      expect(p.landed).toBe(true);
      return p.x;
    };
    expect(land(true)).toBeGreaterThan(land(false) + 10);
  });
});
