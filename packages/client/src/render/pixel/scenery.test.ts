import { describe, expect, it } from 'vitest';
import { meanGround } from './renderer';
import { DEFAULT_THEME, themeFrom, type ThemeData } from './theme';

const base: ThemeData = {
  sky: { top: '#000000', bottom: '#ffffff' },
  letterbox: '#000000',
  light: '#000000',
  trail: '#ffffff',
  grain: 0,
  vignette: 0,
  ambient: { kind: 'none', density: 0, color: '#ffffff' },
  wet: 0,
  snow: 0,
  scanlines: 0,
  flicker: 0,
  scenery: { ranges: [] },
};

describe('scenery', () => {
  it('finds the mean ground row, counting bare columns as the bottom', () => {
    // 3×4 map: column 0 ground from row 1, column 1 from row 3, column 2 none
    const t = new Uint8Array(12);
    t[1 * 3 + 0] = 1;
    t[3 * 3 + 1] = 1;
    expect(meanGround(t, 3, 4)).toBeCloseTo((1 + 3 + 4) / 3);
  });

  it('maps theme scenery, defaulting to none', () => {
    expect(themeFrom(base).clouds).toEqual(DEFAULT_THEME.clouds);
    expect(themeFrom(base).grass).toBe(-1);
    const t = themeFrom({
      ...base,
      scenery: {
        clouds: { cover: 0.5, light: '#ffffff', shadow: '#808080' },
        ranges: ['#112233', '#445566'],
        grass: '#00ff00',
      },
    });
    expect(t.clouds).toEqual({ cover: 0.5, light: 0xffffff, shadow: 0x808080 });
    expect(t.ranges).toEqual([0x112233, 0x445566]);
    expect(t.grass).toBe(0x00ff00);
  });
});
