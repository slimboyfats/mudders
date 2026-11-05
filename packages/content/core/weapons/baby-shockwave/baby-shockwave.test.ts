import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.baby-shockwave', () => {
  it('shoves a nearby tank less far than the standard Shockwave', () => {
    const push = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [40, 230] });
      dropAt(w, wpn, 200);
      return w.tanks[1]!.x - 230;
    };
    expect(push('weapon.baby-shockwave')).toBeGreaterThan(0);
    expect(push('weapon.baby-shockwave')).toBeLessThan(push('weapon.shockwave'));
  });
});
