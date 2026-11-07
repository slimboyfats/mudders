import { describe, expect, it } from 'vitest';
import { WHITEOUT_HOLD, whiteoutAt, whiteoutFor } from './effects';

describe('nuke sky whiteout', () => {
  it('holds full white, then fades steadily back to nothing', () => {
    const { peak, fade } = whiteoutFor(72);
    expect(peak).toBe(1);
    expect(whiteoutAt(-1, peak, fade)).toBe(0);
    expect(whiteoutAt(0, peak, fade)).toBe(1);
    expect(whiteoutAt(WHITEOUT_HOLD, peak, fade)).toBe(1);
    let prev = 1;
    for (let a = WHITEOUT_HOLD + 1; a <= WHITEOUT_HOLD + fade; a++) {
      const v = whiteoutAt(a, peak, fade);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
    expect(whiteoutAt(WHITEOUT_HOLD + fade, peak, fade)).toBe(0);
    expect(whiteoutAt(WHITEOUT_HOLD + fade + 50, peak, fade)).toBe(0);
  });

  it('is slow: still well lit a second after the bang', () => {
    const { peak, fade } = whiteoutFor(72);
    expect(whiteoutAt(60, peak, fade)).toBeGreaterThan(0.6);
  });

  it('scales with the blast: a baby nuke is dimmer and shorter than a heavy one', () => {
    const baby = whiteoutFor(45);
    const heavy = whiteoutFor(100);
    expect(baby.peak).toBeLessThan(heavy.peak);
    expect(baby.fade).toBeLessThan(heavy.fade);
  });
});
