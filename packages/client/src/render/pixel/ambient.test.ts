import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { paletteFrom } from '../../game/palette';
import { drawWeather, drawZones, emitWeather, stormFlash } from './ambient';
import type { Emit } from './particles';
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

  it('drawn weather is a pure function of time and never draws inside the ground', () => {
    for (const id of ['theme.inferno', 'theme.day']) {
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

  it('rain and snow are spawned as particles above the map, the same for the same tick', () => {
    for (const id of ['theme.storm', 'theme.snow']) {
      const th = pixelTheme(id, themes);
      const spawn = (mult: number) => {
        const out: Emit[] = [];
        for (let t = 0; t < 60; t++)
          emitWeather({ add: (e) => out.push(e) }, th, t, 0.002, probe(150), mult);
        return out;
      };
      const a = spawn(1);
      expect(a.length).toBeGreaterThan(0);
      expect(a).toEqual(spawn(1));
      for (const e of a) {
        expect(e.y).toBeLessThan(0);
        expect(e.vy).toBeGreaterThan(0);
      }
      // quality scales the count
      expect(spawn(0.35).length).toBeLessThan(a.length * 0.5);
    }
    // a dry theme spawns nothing
    const out: Emit[] = [];
    emitWeather({ add: (e) => out.push(e) }, pixelTheme('theme.day', themes), 5, 0, probe(150), 1);
    expect(out).toEqual([]);
  });

  it('draws each zone look', () => {
    for (const look of ['gas', 'acid', 'resonance', 'acid-cloud'] as const) {
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

  it('scatters caltrops on the ground under the zone', () => {
    const r = recorder();
    drawZones(
      r.batch,
      r.batch,
      [{ kind: 'zone', x: 200, y: 179, radius: 30, look: 'caltrops', turns: 6 }],
      10,
      probe(180),
      1,
    );
    expect(r.out.length).toBeGreaterThan(20);
  });

  it('storm flicker is occasional and off without a period', () => {
    expect(stormFlash(100, 0)).toBe(0);
    let lit = 0;
    for (let t = 0; t < 20000; t++) if (stormFlash(t, 420) > 0) lit++;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(2000);
  });
});
