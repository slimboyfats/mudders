import { describe, expect, it } from 'vitest';
import { blastLoss, countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.concussion-shell', () => {
  it('digs a smaller crater than a Missile', () => {
    const dug = (weapon: string) => {
      const w = flatWorld(150, { tankColumns: [20, 380] });
      const b = countCells(w);
      dropAt(w, weapon, 200);
      return b - countCells(w);
    };
    expect(dug('weapon.concussion-shell')).toBeLessThan(dug('weapon.missile'));
  });

  it('hits hard dead on and still hurts a tank 25 cells away', () => {
    expect(blastLoss(null, null, 0, 'weapon.concussion-shell')).toBeGreaterThan(90);
    expect(blastLoss(null, null, 25, 'weapon.concussion-shell')).toBeGreaterThan(30);
  });
});
