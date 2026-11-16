import { describe, expect, it } from 'vitest';
import type { TankView } from '@mudders/shared';
import { STAIN_BURNING, STAIN_MUDDY, STAIN_OILED, STAIN_WET, stainBits, stainTint } from './stains';

const view = (extra: Partial<TankView>): TankView => ({
  kind: 'tank',
  player: 0,
  x: 10,
  y: 10,
  angle: 90,
  health: 100,
  maxHealth: 100,
  shield: 0,
  maxShield: 0,
  chute: false,
  tank: '',
  alive: true,
  power: 500,
  chill: 0,
  glue: 0,
  active: false,
  ...extra,
});

describe('tank stain tint', () => {
  it('reads the stains off the tank view', () => {
    expect(stainBits(view({}))).toBe(0);
    expect(stainBits(view({ wet: 2, burning: 1 }))).toBe(STAIN_WET | STAIN_BURNING);
    expect(stainBits(view({ oiled: 1, muddy: 3 }))).toBe(STAIN_OILED | STAIN_MUDDY);
  });

  it('leaves a clean hull alone and tints a stained one on whole cells in a checker', () => {
    const hull = 0x808080;
    expect(stainTint(hull, 3, 4, 8, 0, 0)).toBe(hull);
    // mud cakes the treads (bottom two rows) solid on the checker cells
    expect(stainTint(hull, 2, 6, 8, STAIN_MUDDY, 0)).not.toBe(hull);
    expect(stainTint(hull, 2, 0, 8, STAIN_MUDDY, 0)).toBe(hull);
    // oil darkens every other cell, not its neighbours
    const a = stainTint(hull, 2, 2, 8, STAIN_OILED, 0);
    const b = stainTint(hull, 3, 2, 8, STAIN_OILED, 0);
    expect(a).toBeLessThan(hull);
    expect(b).toBe(hull);
    // wet only below the middle
    expect(stainTint(hull, 1, 1, 8, STAIN_WET, 0)).toBe(hull);
    expect(stainTint(hull, 0, 6, 8, STAIN_WET, 0)).not.toBe(hull);
    for (let c = 0; c < 16; c++) {
      for (let r = 0; r < 8; r++) {
        const v = stainTint(hull, c, r, 8, 15, 37);
        expect(Number.isInteger(v) && v >= 0 && v <= 0xffffff).toBe(true);
      }
    }
  });
});
