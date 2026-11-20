import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, flatWorld } from '../../../src/testing';

/** A transformer core sealed in a steel box standing on the ground. */
function box(w: World): void {
  const g = w.grid;
  const steel = w.mats.cellOf('material.steel');
  const core = w.mats.cellOf('material.transformer');
  for (let y = 140; y < 150; y++)
    for (let x = 195; x < 205; x++) {
      const edge = y === 140 || y === 149 || x === 195 || x === 204;
      g.material[y * g.width + x] = edge ? steel : core;
    }
  g.markDirty(195, 140, 204, 149);
}

describe('material.transformer', () => {
  it('sits quietly while its steel box is sealed', () => {
    const w = flatWorld();
    box(w);
    w.run(200);
    expect(effectsOf(w, 'pocketBurst')).toHaveLength(0);
    expect(countCells(w, 'material.transformer')).toBe(64);
  });

  it('shorts out as soon as the box is opened, charging the steel around it', () => {
    const w = flatWorld();
    box(w);
    w.run(10);
    const g = w.grid;
    for (let x = 197; x < 203; x++) g.clearCell(140 * g.width + x);
    g.markDirty(197, 140, 202, 140);
    w.run(20);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'pocketBurst')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'charge').length).toBeGreaterThanOrEqual(1);
    expect(countCells(w, 'material.transformer')).toBe(0);
  });
});
