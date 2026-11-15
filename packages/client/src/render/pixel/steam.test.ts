import { describe, expect, it } from 'vitest';
import { PKind, type Emit } from './particles';
import { SteamFx, wetSurface } from './steam';

/** A pool from x 50 to 150 with its surface on row 100. */
const pool = { liquid: (x: number, y: number) => x >= 50 && x < 150 && y >= 100 && y < 120 };

describe('steam', () => {
  it('finds the water surface near a blast, nearest first', () => {
    const s = wetSurface(pool, 100, 98, 20, 2, 40);
    expect(s.length).toBeGreaterThan(5);
    for (const c of s) expect(c.y).toBe(100);
    expect(s[0]!.x).toBe(100);
    expect(wetSurface(pool, 300, 98, 20, 2, 40)).toHaveLength(0);
  });

  it('boils the water after a blast, then dies down', () => {
    const fx = new SteamFx();
    const out: Emit[] = [];
    expect(fx.blast(100, 98, 24, 1, 0, pool)).toBeGreaterThan(0);
    for (let t = 0; t < 200; t++) fx.tick(t, pool, { add: (e) => out.push(e) }, 1);
    expect(out.length).toBeGreaterThan(20);
    for (const e of out) {
      expect(e.kind).toBe(PKind.Plume);
      expect(e.y).toBeLessThan(100);
      expect(e.vy).toBeLessThan(0);
    }
    const late: Emit[] = [];
    for (let t = 200; t < 260; t++) fx.tick(t, pool, { add: (e) => late.push(e) }, 1);
    expect(late).toHaveLength(0);
  });

  it('does nothing for a dry blast', () => {
    expect(new SteamFx().blast(300, 98, 24, 1, 0, pool)).toBe(0);
  });

  it('hisses once when a burning shell plunges in', () => {
    const fx = new SteamFx();
    const out: Emit[] = [];
    const sink = { add: (e: Emit) => out.push(e) };
    fx.shell(7, 100, 90, 0, pool, sink);
    expect(out).toHaveLength(0);
    fx.shell(7, 100, 102, 1, pool, sink);
    const n = out.length;
    expect(n).toBeGreaterThan(0);
    fx.shell(7, 100, 104, 2, pool, sink);
    expect(out).toHaveLength(n);
  });
});
