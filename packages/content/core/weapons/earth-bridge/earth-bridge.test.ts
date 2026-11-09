import type { AiApi, AiWeaponView } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { terrainWeapon } from '../../../src/ai';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld, passTurns } from '../../../src/testing';

/** Flat ground at row 150 with a 50-row cliff (plateau at row 100) from column 200 on. */
function cliffWorld() {
  const w = flatWorld(150, { tankColumns: [60, 360] });
  const g = w.grid;
  const W = g.width;
  const dirt = w.mats.cellOf('material.dirt');
  for (let y = 100; y < 150; y++) for (let x = 200; x < W; x++) g.material[y * W + x] = dirt;
  g.clearSettle();
  w.tanks[1]!.y = 100;
  return w;
}

describe('weapon.earth-bridge', () => {
  it('ramps up a cliff that a tank can then drive up', () => {
    const w = cliffWorld();
    const t = w.tanks[0]!;
    const hp = w.tanks.map((k) => k.health);
    dropAt(w, 'weapon.earth-bridge', 240);
    expect(countCells(w, 'material.rammed-earth')).toBeGreaterThan(200);
    // no damage to anyone
    expect(w.tanks.map((k) => k.health)).toEqual(hp);
    // without the ramp the cliff is a wall; with it, a tank drives up it
    passTurns(w, 1);
    expect(w.activePlayer).toBe(0);
    t.driveLeft = 600;
    t.fuel = 999;
    w.applyInput(0, { type: 'drive', dir: 1 });
    for (let i = 0; i < 3000; i++) w.step();
    expect(t.y).toBeLessThanOrEqual(102);
    expect(t.x).toBeGreaterThan(200);
  });

  it('does no damage, even on a direct hit', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    const hp = t.health;
    dropAt(w, 'weapon.earth-bridge', t.x);
    expect(t.health).toBe(hp);
  });

  it('is a mobility tool, not something bots lob at enemies as cover', () => {
    const c = loadContent().get('weapon', 'weapon.earth-bridge');
    const ai = (c as { ai: { expectedDamage: number; terrainValue: number } }).ai;
    expect(ai.expectedDamage).toBe(0);
    const view: AiWeaponView = { index: 3, id: 'weapon.earth-bridge', count: 2, ...ai };
    const api = { weapons: [view] } as unknown as AiApi;
    expect(terrainWeapon(api)).toBeUndefined();
  });
});
