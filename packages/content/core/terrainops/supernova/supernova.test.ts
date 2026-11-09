import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.supernova', () => {
  it('burns, goes off and hurts a tank in reach but not one out of reach', () => {
    const w = flatWorld(200, { map: { width: 800, height: 300 }, tankColumns: [60, 520] });
    const before = w.grid.surfaceY(400);
    dropAt(w, 'weapon.supernova', 400);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'supernovaIgnite')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'supernovaBurst')).toHaveLength(1);
    // dragged in before the blast threw it back out: it was hurt by the core
    expect(w.tanks[1]!.health).toBeLessThan(100);
    // out of reach: untouched
    expect(w.tanks[0]!.health).toBe(100);
    expect(w.grid.surfaceY(400)).toBeGreaterThan(before - 400);
  });

  it('drags a tank toward the star before it goes off', () => {
    const w = flatWorld(200, { map: { width: 800, height: 300 }, tankColumns: [60, 520] });
    let minX = 520;
    const idx = w.weaponByIndex('weapon.supernova');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 400 * 65536,
      y: 190 * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let n = 0; n < 150; n++) {
      w.step();
      minX = Math.min(minX, w.tanks[1]!.x);
    }
    expect(minX).toBeLessThan(500);
  });

  it('goes off on the tick the star collapses', () => {
    const w = flatWorld(200, { map: { width: 800, height: 300 }, tankColumns: [60, 740] });
    dropAt(w, 'weapon.supernova', 400);
    const ev = w.snapshot().effectEvents;
    const burst = ev.find((e) => e.type === 'supernovaBurst')!;
    const wave = ev.find((e) => e.type === 'pressureWave')!;
    expect(Math.abs(wave.tick - burst.tick)).toBeLessThanOrEqual(1);
  });
});
