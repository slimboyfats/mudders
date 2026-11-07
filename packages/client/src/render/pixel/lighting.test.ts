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

  it('reports no sources on a cold map', () => {
    const out = new Uint8Array(4);
    const z = new Uint8Array(4);
    expect(heatField(z, z, new Uint8Array(256), 2, 2, out)).toBe(false);
    expect(Array.from(out)).toEqual([HEAT_NONE, HEAT_NONE, HEAT_NONE, HEAT_NONE]);
  });
});
