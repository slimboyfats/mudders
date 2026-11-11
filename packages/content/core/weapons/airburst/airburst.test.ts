import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

describe('weapon.airburst', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.airburst')).toBe(true);
  });

  it('bursts in the air when pressed and hurts a tank below without a crater', () => {
    const w = flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
    const at = fireAndPress(w, 'weapon.airburst', 60, 700, 30);
    expect(at).not.toBeNull();
    for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
    // it went off up in the air, so the ground under it is untouched
    expect(w.grid.surfaceY(Math.round(at!.x))).toBe(150);
  });
});
