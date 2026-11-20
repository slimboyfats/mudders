import { describe, expect, it } from 'vitest';
import { effectsOf, fireAndSettle, flatWorld } from '../../../src/testing';

const kit = { 'gear.mod-split': 2, 'weapon.missile': 5, 'weapon.drill-torpedo': 1 };

describe('gear.mod-split', () => {
  it('fits while aiming without using the turn, and comes off when pressed again', () => {
    const w = flatWorld(150, { tankSetup: [{ inventory: kit }] });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.mod-split');
    w.applyInput(0, { type: 'useGear', gear: 'gear.mod-split' });
    w.step();
    expect([t.mod, t.gear[g], w.phase]).toEqual([g, 2, 'aim']);
    w.applyInput(0, { type: 'useGear', gear: 'gear.mod-split' });
    w.step();
    expect([t.mod, t.gear[g]]).toEqual([-1, 2]);
    expect(effectsOf(w, 'modFit')).toHaveLength(2);
  });

  it('turns the next plain shell into three in a fan, and is used up', () => {
    const w = flatWorld(150, { tankSetup: [{ inventory: kit }] });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.mod-split');
    w.applyInput(0, { type: 'useGear', gear: 'gear.mod-split' });
    w.applyInput(0, { type: 'selectWeapon', weapon: 'weapon.missile' });
    w.applyInput(0, { type: 'aim', angle: 60, power: 500 });
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect(w.projectiles).toHaveLength(3);
    const [a, b, c] = w.projectiles;
    // fanned: the low shell flies flattest, the high one steepest
    expect(a!.vy / a!.vx).toBeGreaterThan(b!.vy / b!.vx);
    expect(b!.vy / b!.vx).toBeGreaterThan(c!.vy / c!.vx);
    expect(t.gear[g]).toBe(1);
    expect(t.mod).toBe(g); // one left: stays fitted
    let lands = 0;
    for (let i = 0; i < 1200 && w.phase === 'resolve'; i++) {
      w.step();
      lands = Math.max(lands, 3 - w.projectiles.length);
    }
    expect(lands).toBe(3);
  });

  it('stays fitted, unused, through a shot that takes no mods', () => {
    const w = flatWorld(150, { tankSetup: [{ inventory: kit }] });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.mod-split');
    w.applyInput(0, { type: 'useGear', gear: 'gear.mod-split' });
    w.step();
    fireAndSettle(w, 'weapon.drill-torpedo', 45, 400);
    expect([t.mod, t.gear[g]]).toEqual([g, 2]);
    expect(w.weaponModable('weapon.drill-torpedo')).toBe(false);
    expect(w.weaponModable('weapon.missile')).toBe(true);
  });
});
