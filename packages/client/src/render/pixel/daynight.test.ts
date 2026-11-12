import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, dayPhase, withTimeOfDay, type PixelTheme } from './theme';

const DAY: PixelTheme = { ...DEFAULT_THEME, skyTop: 0x4a8ad0, skyBottom: 0xb8dcf4, dark: 0 };

describe('time of day across rounds', () => {
  it('round 1 is the theme as picked', () => {
    expect(dayPhase(DAY, 0)).toBe('as-is');
    expect(withTimeOfDay(DAY, 'as-is')).toBe(DAY);
  });

  it('a daylight theme goes on to sunset, night and dawn, then round again', () => {
    expect([1, 2, 3, 4].map((r) => dayPhase(DAY, r))).toEqual(['sunset', 'night', 'dawn', 'as-is']);
  });

  it('a night-sky theme goes on to dawn, day and sunset', () => {
    expect([1, 2, 3].map((r) => dayPhase(DEFAULT_THEME, r))).toEqual(['dawn', 'day', 'sunset']);
  });

  it('dark themes never change', () => {
    const black = { ...DAY, dark: 0.6 };
    for (let r = 0; r < 4; r++) expect(dayPhase(black, r)).toBe('as-is');
  });

  it('night darkens the sky and brings out stars; day takes them away', () => {
    const night = withTimeOfDay(
      { ...DAY, ambient: { kind: 'none', density: 0, color: 0 } },
      'night',
    );
    expect(night.skyTop & 0xff).toBeLessThan(DAY.skyTop & 0xff);
    expect(night.ambient.kind).toBe('stars');
    expect(night.dark).toBeGreaterThan(0);
    const day = withTimeOfDay(
      { ...DEFAULT_THEME, ambient: { kind: 'stars', density: 60, color: 0xffffff } },
      'day',
    );
    expect(day.ambient.kind).toBe('none');
  });
});
