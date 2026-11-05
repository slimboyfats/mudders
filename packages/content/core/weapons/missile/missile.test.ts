import { describe, expect, it } from 'vitest';
import { countCells, fireAndSettle, makeWorld } from '../../../src/testing';

describe('weapon.missile', () => {
  it('hits the other tank from across the map (scenario aim) and carves a crater', () => {
    const w = makeWorld({
      seed: 7,
      map: { width: 800, height: 400 },
      tankColumns: [150, 620],
      wind: 0,
      turnOrder: [0, 1],
    });
    const before = countCells(w);
    fireAndSettle(w, 'weapon.missile', 55, 605);
    expect(w.tanks[1]!.health).toBeLessThan(60);
    expect(w.tanks[0]!.damageDealt).toBe(100 - w.tanks[1]!.health);
    expect(countCells(w)).toBeLessThan(before);
    expect(w.phase).toBe('aim');
    expect(w.tanks[0]!.inventory[w.weapons.findIndex((x) => x.id === 'weapon.missile')]).toBe(-1);
  });
});
