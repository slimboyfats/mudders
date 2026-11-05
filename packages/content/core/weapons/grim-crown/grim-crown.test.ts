import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.grim-crown', () => {
  it('splits into seven heavy warheads at the apex', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.grim-crown', 80, 120, 2, -3);
    expect(effectsOf(w, 'burst')).toHaveLength(7);
  });
});
