import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.skipper-hop', () => {
  it('goes off and bounces once more', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.skipper-hop', 200);
    expect(effectsOf(w, 'burst')).toHaveLength(2);
  });
});
