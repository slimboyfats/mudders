import { describe, expect, it } from 'vitest';
import {
  HEAT_NONE,
  HEAT_REACH,
  Lights,
  MAX_LIGHTS,
  band,
  heatFalloff,
  heatField,
  lightAt,
  litColor,
} from './lighting';

describe('Lights', () => {
  it('keeps the strongest lights when full', () => {
    const l = new Lights();
    for (let i = 0; i < MAX_LIGHTS + 3; i++) l.add(i * 10, 0, 10, 0.1 + i * 0.1, 0xffffff);
    expect(l.count).toBe(MAX_LIGHTS);
    const strengths = Array.from({ length: l.count }, (_, i) => l.pos[i * 4 + 3]!);
    expect(Math.min(...strengths)).toBeGreaterThan(0.35);
  });

  it('lights cells near a light, not beyond its radius', () => {
    const l = new Lights();
    l.add(50, 50, 20, 1.2, 0xff8040);
    const out: [number, number, number] = [0, 0, 0];
    expect(lightAt(l, 50, 50, out)[0]).toBeGreaterThan(0.5);
    expect(lightAt(l, 80, 50, out)).toEqual([0, 0, 0]);
  });
});

describe('band', () => {
  it('snaps to hard steps', () => {
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) expect((band(0.6, x, y) * 4) % 1).toBe(0);
    }
    expect(band(0, 1, 1)).toBe(0);
  });
});

describe('litColor', () => {
  it('leaves colours alone without light and brightens them with it', () => {
    expect(litColor(0x404040, [0, 0, 0])).toBe(0x404040);
    const c = litColor(0x404040, [0.5, 0.5, 0.5]);
    expect(c & 255).toBeGreaterThan(0x40);
    expect(litColor(0xffffff, [2, 2, 2])).toBe(0xffffff);
  });
});

describe('heatField', () => {
  it('measures whole-cell distance from hot cells, capped at the reach', () => {
    const w = 40;
    const h = 20;
    const terrain = new Uint8Array(w * h);
    const coating = new Uint8Array(w * h);
    const flags = new Uint8Array(256);
    flags[5] = 2; // hot (lava)
    terrain[10 * w + 5] = 5;
    const out = new Uint8Array(w * h);
    expect(heatField(terrain, coating, flags, w, h, out)).toBe(true);
    expect(out[10 * w + 5]).toBe(0);
    expect(out[10 * w + 8]).toBe(3);
    expect(out[10 * w + 5 + HEAT_REACH]).toBe(HEAT_REACH);
    expect(out[10 * w + 39]).toBe(HEAT_NONE);
    expect(heatFalloff(0)).toBe(0);
    expect(heatFalloff(1)).toBe(1);
    expect(heatFalloff(HEAT_REACH + 1)).toBe(0);
  });

  it('tells which glowing material each cell is nearest to', () => {
    const w = 100;
    const h = 10;
    const terrain = new Uint8Array(w * h);
    const coating = new Uint8Array(w * h);
    const flags = new Uint8Array(256);
    flags[5] = 2; // hot (lava)
    flags[90] = 8; // emits (plasma)
    terrain[5 * w + 5] = 5;
    coating[5 * w + 90] = 90;
    const out = new Uint8Array(w * h);
    const src = new Uint8Array(w * h);
    expect(heatField(terrain, coating, flags, w, h, out, src)).toBe(true);
    expect(src[5 * w + 5]).toBe(5);
    expect(src[5 * w + 12]).toBe(5);
    expect(src[2 * w + 84]).toBe(90);
    expect(src[5 * w + 90]).toBe(90);
    // beyond the glow reach of both: no source
    expect(out[5 * w + 47]).toBe(HEAT_NONE);
    expect(src[5 * w + 47]).toBe(0);
  });

  it('with a kept box gives the same field as a whole rebuild, edit after edit', () => {
    const w = 132;
    const h = 90;
    const terrain = new Uint8Array(w * h);
    const coating = new Uint8Array(w * h);
    const flags = new Uint8Array(256);
    flags[5] = 2;
    flags[90] = 8;
    const out = new Uint8Array(w * h).fill(HEAT_NONE);
    const src = new Uint8Array(w * h);
    const box = { x0: 0, y0: 0, x1: -1, y1: -1 };
    const wholeOut = new Uint8Array(w * h);
    const wholeSrc = new Uint8Array(w * h);
    let r = 99;
    const rnd = (n: number): number => {
      r = (Math.imul(r, 1103515245) + 12345) >>> 0;
      return (r >>> 8) % n;
    };
    for (let step = 0; step < 120; step++) {
      // sources come and go in a patch that wanders; now and then all of them go out
      if (step % 17 === 16) {
        terrain.fill(step % 2 ? 0 : 3);
        coating.fill(0);
      } else {
        const cx = rnd(w);
        const cy = rnd(h);
        for (let k = 0; k < 6; k++) {
          const i = Math.min(h - 1, cy + rnd(5)) * w + Math.min(w - 1, cx + rnd(9));
          const kind = rnd(4);
          if (kind === 0) terrain[i] = 5;
          else if (kind === 1) coating[i] = 90;
          else if (kind === 2) terrain[i] = 3;
          else coating[i] = 0;
        }
      }
      const a = heatField(terrain, coating, flags, w, h, out, src, box);
      const b = heatField(terrain, coating, flags, w, h, wholeOut, wholeSrc);
      expect(a).toBe(b);
      expect(out).toEqual(wholeOut);
      expect(src).toEqual(wholeSrc);
    }
  });

  it('reports no sources on a cold map', () => {
    const out = new Uint8Array(4);
    const z = new Uint8Array(4);
    expect(heatField(z, z, new Uint8Array(256), 2, 2, out)).toBe(false);
    expect(Array.from(out)).toEqual([HEAT_NONE, HEAT_NONE, HEAT_NONE, HEAT_NONE]);
  });
});
