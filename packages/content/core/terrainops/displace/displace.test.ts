import { describe, expect, it } from 'vitest';
import type { MaterialManifest } from '@mudders/shared';
import { MaterialTable, behaviourParams } from '@mudders/sim';
import { loadContent } from '../../../src/index';
import { countCells, flatWorld, flatten, makeWorld } from '../../../src/testing';
import displace from './behaviour';

const call = {
  x: 300,
  y: 150,
  radius: 60,
  damageType: 'shock' as const,
  damageTypeIndex: 4,
  owner: 0,
};

describe('terrainop.displace', () => {
  it('expands over several ticks, conserves mass and leaves a bowl with a rim', () => {
    const w = makeWorld({ map: { width: 600, height: 300 }, tankColumns: [20, 580] });
    flatten(w, 150);
    const before = countCells(w);
    const p = displace.params.parse(behaviourParams(loadContent().raw('terrainop.displace')!));
    const data = displace.start(w, p, call);
    expect(data).not.toBeNull();
    w.ops.push({ op: 0, call, t: 0, data: data! });
    // drive the op directly through its step
    for (let t = 1; t < 40; t++) {
      if (!displace.step!(w, p, { op: 0, call, t, data: data! })) break;
      w.step();
    }
    w.ops.length = 0;
    w.run(300);
    expect(w.debris.count).toBe(0);
    // only the few cells flung off the map edges are lost
    expect(before - countCells(w)).toBeLessThan(before * 0.001);
    expect(w.grid.surfaceY(300)).toBeGreaterThan(150);
    const rim = Math.min(
      w.grid.surfaceY(300 - 60),
      w.grid.surfaceY(300 + 60),
      w.grid.surfaceY(300 - 75),
      w.grid.surfaceY(300 + 75),
    );
    expect(rim).toBeLessThan(150);
  });

  it('moves cohesive bodies as one blob', () => {
    const w = makeWorld({ map: { width: 600, height: 300 }, tankColumns: [20, 580] });
    flatten(w, 290);
    const glue: MaterialManifest = {
      id: 'material.glue',
      schemaVersion: 1,
      meta: { name: 'g', description: 'g', since: 'core@0.1.0' },
      cell: 200,
      settle: 'fall',
      density: 1,
      strength: {},
      cohesion: 1,
      coating: false,
    };
    const mats = new MaterialTable([...loadContent().list('material'), glue]);
    Object.defineProperty(w, 'mats', { value: mats });
    for (let y = 140; y < 150; y++) for (let x = 330; x < 340; x++) w.grid.set(x, y, 200);
    const p = displace.params.parse({
      speed: 3,
      lift: 0.5,
      minSpeed: 0.1,
      expandTicks: 1,
      blobPush: 20,
      maxBlob: 1000,
    });
    displace.start(w, p, call);
    let minX = 600;
    let n = 0;
    for (let y = 0; y < 300; y++)
      for (let x = 0; x < 600; x++)
        if (w.grid.get(x, y) === 200) {
          n++;
          minX = Math.min(minX, x);
        }
    expect(n).toBe(100);
    expect(minX).toBeGreaterThan(330);
  });

  it('throws a tank in an arc when the ring front reaches it, the nearer the farther', () => {
    const throwFrom = (col: number) => {
      const w = flatWorld(150, { map: { width: 900, height: 300 }, tankColumns: [40, col] });
      const t = w.tanks[1]!;
      const y0 = t.y;
      let top = y0;
      let start = -1;
      const idx = w.weaponByIndex('weapon.heavy-shockwave');
      w.projectiles.push({
        id: 999,
        weapon: idx,
        owner: 0,
        x: 300 * 65536 + 32768,
        y: (w.grid.surfaceY(300) - 6) * 65536,
        vx: 0,
        vy: 65536,
        age: 10,
        alive: true,
        data: [],
      });
      for (let i = 0; i < 400; i++) {
        w.step();
        if (start < 0 && t.y < y0 - 2) start = i;
        top = Math.min(top, t.y);
      }
      return { lift: y0 - top, moved: t.x - col, start };
    };
    const near = throwFrom(330);
    const far = throwFrom(390);
    // airborne, away from the blast, and only once the ring got there
    expect(near.lift).toBeGreaterThan(10);
    expect(near.moved).toBeGreaterThan(20);
    expect(near.moved).toBeGreaterThan(far.moved);
    expect(far.start).toBeGreaterThan(near.start);
  });
});
