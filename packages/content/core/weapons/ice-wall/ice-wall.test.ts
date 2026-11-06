import type { AiApi, AiWeaponView } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { terrainWeapon } from '../../../src/ai';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.ice-wall', () => {
  it('raises cover that stops a flat shot', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.ice-wall', 200);
    const ice = countCells(w, 'material.ice');
    const hp = w.tanks[1]!.health;
    launchAt(w, 'weapon.baby-missile', 170, 125, 3, 0);
    expect(w.tanks[1]!.health).toBe(hp);
    // dented, not gone
    expect(countCells(w, 'material.ice')).toBeGreaterThan(ice / 2);
    expect(w.grid.get(200, 112)).toBe(w.mats.cellOf('material.ice'));
  });

  it('does no damage itself, even on a direct hit', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    const hp = t.health;
    dropAt(w, 'weapon.ice-wall', t.x);
    expect(t.health).toBe(hp);
    expect(countCells(w, 'material.ice')).toBeGreaterThan(100);
  });

  it('is a terrain weapon bots that bought it will use', () => {
    const c = loadContent().get('weapon', 'weapon.ice-wall');
    expect(c).toMatchObject({ ai: { expectedDamage: 0 } });
    const ai = (c as { ai: { expectedDamage: number; terrainValue: number } }).ai;
    const view: AiWeaponView = { index: 3, id: 'weapon.ice-wall', count: 2, ...ai };
    const api = { weapons: [view] } as unknown as AiApi;
    expect(terrainWeapon(api)).toBe(view);
  });
});
