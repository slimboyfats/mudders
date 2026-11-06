import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.magnet-mine', () => {
  it('drags a tank in range onto the mine, then blows up with it clamped on', () => {
    const w = flatWorld(150, { tankColumns: [20, 265] });
    dropAt(w, 'weapon.magnet-mine', 200);
    const clank = effectsOf(w, 'magnetClank');
    expect(clank.length).toBe(1);
    // clamped on beside the mine, and caught in the blast
    expect(Math.abs(clank[0]!.x - 200)).toBeLessThan(14);
    expect(w.tanks[1]!.health).toBeLessThan(70);
    // the shooter, out of range, is left alone
    expect(w.tanks[0]!.x).toBe(20);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('a wall too tall to be hauled over holds the tank back', () => {
    const w = flatWorld(150, { tankColumns: [20, 265] });
    const dirt = w.mats.cellOf('material.dirt');
    for (let y = 130; y < 150; y++)
      for (let x = 238; x < 244; x++) w.grid.material[y * w.grid.width + x] = dirt;
    w.grid.clearSettle();
    dropAt(w, 'weapon.magnet-mine', 200);
    expect(effectsOf(w, 'magnetClank').length).toBe(0);
    expect(w.tanks[1]!.x).toBeGreaterThan(244);
    expect(w.tanks[1]!.x).toBeLessThan(265);
  });

  it('switches on after it beds in, then goes off when the field runs out', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.magnet-mine', 200);
    const ev = w.snapshot().effectEvents;
    const on = ev.find((e) => e.type === 'magnetOn');
    const boom = ev.filter((e) => e.type === 'flash').at(-1);
    expect(on).toBeDefined();
    expect(boom).toBeDefined();
    expect(boom!.tick - on!.tick).toBeGreaterThanOrEqual(140);
  });
});
