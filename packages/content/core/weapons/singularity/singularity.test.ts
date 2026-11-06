import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.singularity', () => {
  it('heaps the ground, then blows it outward and hurts a tank nearby', () => {
    const w = flatWorld(150, { tankColumns: [20, 240] });
    const b = countCells(w);
    const ticks = dropAt(w, 'weapon.singularity', 200);
    expect(ticks).toBeGreaterThan(48);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(effectsOf(w, 'flash').length).toBeGreaterThan(0);
    expect(countCells(w)).toBeLessThan(b);
  });

  it('hangs as a vortex, then blows out in a pressure wave', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.singularity', 200);
    const ev = w.snapshot().effectEvents;
    const vortex = ev.find((e) => e.type === 'vortex');
    const wave = ev.find((e) => e.type === 'pressureWave');
    expect(vortex).toBeDefined();
    expect(wave).toBeDefined();
    expect(wave!.tick - vortex!.tick).toBeGreaterThanOrEqual(40);
  });
});
