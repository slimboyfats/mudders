import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.napalm', () => {
  it('splashes burning jelly that hurts a tank and leaves ash', () => {
    const w = flatWorld(150, { tankColumns: [40, 206] });
    dropAt(w, 'weapon.napalm', 200);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(0);
    expect(countCells(w, 'material.napalm')).toBe(0);
  });

  it('goes up in a fireball and throws burning gobs out to both sides', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.napalm', 200);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'fireball')).toHaveLength(1);
    const gobs = ev.filter((e) => e.type === 'flash' && e.radius === 4);
    expect(gobs).toHaveLength(8);
    expect(gobs.some((g) => g.x < 185)).toBe(true);
    expect(gobs.some((g) => g.x > 215)).toBe(true);
  });
});
