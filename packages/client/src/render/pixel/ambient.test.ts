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

  it('fills newly shown sky at once, and only that band', () => {
    const th = pixelTheme('theme.storm', themes);
    const p = probe(150);
    const steady: Emit[] = [];
    emitWeather({ add: (e) => steady.push(e) }, th, 9, 0, p, 1, 600, 600);
    for (const e of steady) expect(e.y).toBeLessThan(-600);
    const grown: Emit[] = [];
    emitWeather({ add: (e) => grown.push(e) }, th, 9, 0, p, 1, 600, 200);
    const fill = grown.filter((e) => e.y > -600);
    // about as many per row as steady fall leaves: this tick's drops spread over their speed
    expect(fill.length).toBeGreaterThan(steady.length * 40);
    expect(fill.length).toBeLessThan(steady.length * 160);
    for (const e of fill) {
      expect(e.y).toBeLessThan(-200);
      expect(e.y).toBeGreaterThan(-610);
      // each lives long enough to reach the bottom of the map from where it starts
      expect(e.life * e.vy).toBeGreaterThan(p.height - e.y);
    }
    // nothing extra once the sky is full
    const full: Emit[] = [];
    emitWeather({ add: (e) => full.push(e) }, th, 9, 0, p, 1, 600, 604);
    expect(full).toEqual(steady);
    // and nothing at all while rain started higher up is still coming down through the top
    const draining: Emit[] = [];
    emitWeather({ add: (e) => draining.push(e) }, th, 9, 0, p, 1, 600, 900);
    expect(draining).toEqual([]);
  });

  it('never starts more than the engine has room to hold in the air', () => {
    for (const id of ['theme.storm', 'theme.snow']) {
      const th = pixelTheme(id, themes);
      const p = probe(150);
      const count = (room?: number): number => {
        let n = 0;
        // the sky already full, so only the steady fall counts
        for (let t = 0; t < 400; t++) {
          emitWeather({ add: () => n++ }, th, t, 0, p, 1, 800, 800, room);
        }
        return n;
      };
      const free = count();
      expect(free).toBeGreaterThan(0);
      let longest = 0;
      emitWeather({ add: (e) => (longest = Math.max(longest, e.life)) }, th, 1, 0, p, 1, 800, 0);
      const room = Math.round(((free / 400) * longest) / 4);
      const tight = count(room);
      expect(tight).toBeLessThan(free * 0.3);
      expect((tight / 400) * longest).toBeLessThanOrEqual(room);
      // plenty of room changes nothing
      expect(count(room * 100)).toBe(free);
    }
  });

  it('draws each zone look', () => {
    // a gas haze draws nothing here: it is gas cells fed into the air (see air.test.ts)
    for (const look of ['acid', 'resonance', 'acid-cloud'] as const) {
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

  it('starts the weather above the screen when sky shows over the map, and lets it reach the ground', () => {
    const th = pixelTheme('theme.storm', themes);
    const flat: Emit[] = [];
    const tall: Emit[] = [];
    for (let t = 0; t < 200; t++) {
      emitWeather({ add: (e) => flat.push(e) }, th, t, 0, probe(150), 1);
      emitWeather({ add: (e) => tall.push(e) }, th, t, 0, probe(150), 1, 400);
    }
    expect(tall.length).toBe(flat.length);
    expect(Math.max(...flat.map((e) => e.y))).toBeLessThan(0);
    expect(Math.max(...tall.map((e) => e.y))).toBeLessThan(-400);
    // the slowest drop (4 cells a tick) still has the life to cross the sky and the whole map
    for (const e of tall) expect(e.life * 4).toBeGreaterThan(400 + 200);
  });
});
