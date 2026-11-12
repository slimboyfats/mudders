import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { flatWorld } from './testing';

/** A block of `material` (w × h cells) hanging `gap` cells over tank 0, then let go. */
function dropOn(material: string, w: number, h: number, gap: number): World {
  const world = flatWorld(150);
  const t = world.tanks[0]!;
  const m = world.mats.cellOf(material);
  const bottom = t.y - t.h - gap;
  for (let y = bottom - h; y < bottom; y++)
    for (let x = t.x - (w >> 1); x < t.x + (w >> 1); x++) world.grid.set(x, y, m);
  world.grid.markDirty(t.x - w, bottom - h, t.x + w, bottom);
  world.run(400);
  return world;
}

const hurt = (w: World): number => 100 - w.tanks[0]!.health;

describe('falling ground hurts tanks', () => {
  it('a mass of dirt from high up hurts the tank it lands on, and only that tank', () => {
    const w = dropOn('material.dirt', 30, 20, 60);
    expect(hurt(w)).toBeGreaterThan(12);
    expect(hurt(w)).toBeLessThan(35);
    expect(w.tanks[1]!.health).toBe(100);
    expect(w.tanks[0]!.alive).toBe(true);
  });

  it('a thin layer from a short drop only buries', () => {
    expect(hurt(dropOn('material.dirt', 30, 4, 4))).toBe(0);
  });

  it('a small heap hurts less than a big one', () => {
    const small = hurt(dropOn('material.dirt', 8, 6, 60));
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(hurt(dropOn('material.dirt', 30, 20, 60)));
  });

  it('light snow hurts less than dirt', () => {
    const snow = hurt(dropOn('material.snow', 30, 20, 60));
    expect(snow).toBeGreaterThan(0);
    expect(snow).toBeLessThan(hurt(dropOn('material.dirt', 30, 20, 60)));
  });

  it('a block of rock that comes down in pieces hurts', () => {
    expect(hurt(dropOn('material.rock', 12, 8, 50))).toBeGreaterThan(4);
  });

  it('is the same every time', () => {
    expect(dropOn('material.dirt', 30, 20, 60).hash()).toBe(
      dropOn('material.dirt', 30, 20, 60).hash(),
    );
  });
});
