import { describe, expect, it } from 'vitest';
import type { MaterialManifest } from '@mudders/shared';
import { MaterialTable, behaviourParams } from '@mudders/sim';
import { loadContent } from '../../../src/index';
import { countCells, flatten, makeWorld } from '../../../src/testing';
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
});
