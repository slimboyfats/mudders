import { describe, expect, it } from 'vitest';
import { countCells, dropAt, propWorld } from '../../../src/testing';

describe('prop.fuel-barrels', () => {
  it('stands as three sealed drums of fuel and stays still', () => {
    const w = propWorld('prop.fuel-barrels', 200);
    expect(countCells(w, 'material.barrel-fuel')).toBeGreaterThan(30);
    w.run(200);
    expect(w.snapshot().effectEvents.filter((e) => e.type === 'pocketBurst')).toHaveLength(0);
    expect(w.quiet).toBe(true);
  });

  it('goes up drum after drum when one is hit: each one flies up and bursts in the air', () => {
    const w = propWorld('prop.fuel-barrels', 200);
    w.snapshot();
    dropAt(w, 'weapon.baby-missile', 196, 1);
    let bursts = 0;
    let topY = 999;
    const flying = w.weaponByIndex('weapon.flying-barrel');
    for (let t = 0; t < 600; t++) {
      w.step();
      for (const p of w.projectiles) if (p.weapon === flying) topY = Math.min(topY, p.y >> 16);
      bursts += w.snapshot().effectEvents.filter((e) => e.type === 'pocketBurst').length;
    }
    expect(bursts).toBeGreaterThanOrEqual(2);
    expect(countCells(w, 'material.barrel-fuel')).toBe(0);
    // the drums climb well above where they stood
    expect(topY).toBeLessThan(150 - 30);
  });
});
