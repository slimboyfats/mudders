import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.thunderstorm-bolt', () => {
  it('hurts a tank it hits and fuses the ground into glass', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    dropAt(w, 'weapon.thunderstorm-bolt', 200);
    expect(w.tanks[1]!.health).toBeLessThan(90);
    expect(w.tanks[1]!.health).toBeGreaterThan(50);
    expect(countCells(w, 'material.fulgurite')).toBeGreaterThan(0);
  });

  it('is not sold in the shop', () => {
    const w = flatWorld(150);
    expect(w.weapons[w.weaponByIndex('weapon.thunderstorm-bolt')]!.price).toBe(0);
  });
});
