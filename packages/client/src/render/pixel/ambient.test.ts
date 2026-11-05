import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { paletteFrom } from '../../game/palette';
import { drawWeather, drawZones, stormFlash } from './ambient';
import type { QuadBatch } from './batch';
import { DEFAULT_THEME, pixelTheme } from './theme';

/** Records pushes instead of drawing. */
function recorder(): { batch: QuadBatch; out: number[][] } {
  const out: number[][] = [];
  const batch = {
    push: (...a: number[]) => {
      out.push(a);
    },
  } as unknown as QuadBatch;
  return { batch, out };
}

const probe = (ground: number) => ({
  width: 400,
  height: 200,
  solid: (_x: number, y: number) => y >= ground,
});

describe('ambient layers', () => {
  const themes = paletteFrom(loadContent()).themes;

  it('builds every content theme and falls back for unknown ids', () => {
    expect(Object.keys(themes ?? {})).toContain('theme.storm');
    expect(pixelTheme('theme.nope', themes)).toBe(DEFAULT_THEME);
    expect(pixelTheme('theme.snow', themes).snow).toBeGreaterThan(0);
  });

  it('weather is a pure function of time and never draws inside the ground', () => {
    for (const id of ['theme.storm', 'theme.snow', 'theme.inferno', 'theme.day']) {
      const th = pixelTheme(id, themes);
      const a = recorder();
      const b = recorder();
      drawWeather(a.batch, a.batch, th, 123.5, 0.002, probe(150), 1);
      drawWeather(b.batch, b.batch, th, 123.5, 0.002, probe(150), 1);
      expect(a.out.length).toBeGreaterThan(0);
      expect(a.out).toEqual(b.out);
      for (const p of a.out) expect(p[1]!).toBeLessThan(151);
    }
  });

  it('quality scales the particle count', () => {
    const th = pixelTheme('theme.storm', themes);
    const hi = recorder();
    const lo = recorder();
    drawWeather(hi.batch, hi.batch, th, 50, 0, probe(200), 1);
    drawWeather(lo.batch, lo.batch, th, 50, 0, probe(200), 0.35);
    expect(lo.out.length).toBeLessThan(hi.out.length * 0.5);
  });

  it('draws each zone look', () => {
    for (const look of ['gas', 'acid', 'resonance'] as const) {
      const r = recorder();
      drawZones(
        r.batch,
        r.batch,
        [{ kind: 'zone', x: 200, y: 100, radius: 30, look, turns: 2 }],
        10,
        probe(180),
        1,
      );
      expect(r.out.length).toBeGreaterThan(5);
    }
  });

  it('storm flicker is occasional and off without a period', () => {
    expect(stormFlash(100, 0)).toBe(0);
    let lit = 0;
    for (let t = 0; t < 20000; t++) if (stormFlash(t, 420) > 0) lit++;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(2000);
  });
});
