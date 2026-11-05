import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, fireAndSettle, makeWorld } from '../../../src/testing';

describe('weapon.baby-missile', () => {
  it('is a Missile that overrides only the explosion size (extends + use)', () => {
    const c = loadContent();
    const raw = c.raw('weapon.baby-missile')!;
    expect(raw.extends).toBe('weapon.missile');
    expect(raw).not.toHaveProperty('flight');
    const baby = c.get('weapon', 'weapon.baby-missile');
    const missile = c.get('weapon', 'weapon.missile');
    expect(baby.flight).toEqual(missile.flight);
    expect(baby.triggers).toEqual(missile.triggers);
    expect(baby.impact[0]).toMatchObject({
      explosion: { ref: 'explosion.standard', radius: 12, damage: 30 },
    });
  });

  it('removes less terrain and does less damage than a Missile', () => {
    const run = (weapon: string) => {
      const w = makeWorld({
        seed: 7,
        map: { width: 800, height: 400 },
        tankColumns: [150, 620],
        wind: 0,
        turnOrder: [0, 1],
      });
      const before = countCells(w);
      fireAndSettle(w, weapon, 55, 605);
      return {
        removed: before - countCells(w),
        hp: w.tanks[1]!.health,
        inv: w.tanks[0]!.inventory,
      };
    };
    const big = run('weapon.missile');
    const small = run('weapon.baby-missile');
    expect(small.removed).toBeLessThan(big.removed);
    expect(small.hp).toBeGreaterThan(big.hp);
    expect(small.inv).toContain(9);
  });
});
