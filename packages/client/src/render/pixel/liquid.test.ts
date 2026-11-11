import { describe, expect, it } from 'vitest';
import type { QuadBatch } from './batch';
import { LiquidSurface } from './liquid';
import { Particles, PKind, type Emit } from './particles';

const W = 60;
const H = 20;
const WATER = 19;
const LAVA = 5;

/** A flat pool of `mat` from row 10 down, across columns x0..x1, rock elsewhere below row 10. */
function terrain(mat: number, x0 = 0, x1 = W - 1): Uint8Array {
  const t = new Uint8Array(W * H);
  for (let y = 10; y < H; y++)
    for (let x = 0; x < W; x++) t[y * W + x] = x >= x0 && x <= x1 ? mat : 3;
  return t;
}

function recorder(): { batch: QuadBatch; out: number[][] } {
  const out: number[][] = [];
  const batch = {
    push: (...a: number[]) => {
      out.push(a);
    },
  } as unknown as QuadBatch;
  return { batch, out };
}

function make(mat: number): LiquidSurface {
  const colors = new Uint32Array(256);
  colors[WATER] = 0x3a78c8;
  colors[LAVA] = 0xff5a1f;
  const l = new LiquidSurface(W, H, [WATER], [LAVA], [], colors);
  l.setTerrain(terrain(mat));
  return l;
}

describe('liquid surface', () => {
  it('rescans only the columns a snapshot changed, and finds the change there', () => {
    const t = terrain(3);
    const l = new LiquidSurface(W, H, [WATER], [], [], new Uint32Array(256));
    l.setTerrain(t);
    const p = new Particles(100);
    l.tick(0, 0, p);
    expect(l.surfaceAt(12)).toBe(-1);
    // water floods columns 10..14 in place; the snapshot says which cells changed
    for (let x = 10; x <= 14; x++) t[10 * W + x] = WATER;
    l.setTerrain(t, [{ x: 10, w: 5 }]);
    l.tick(1, 0, p);
    expect(l.surfaceAt(12)).toBe(10);
    // a change outside every reported rect is not looked for (the sim always reports its edits)
    t[10 * W + 40] = WATER;
    l.setTerrain(t, []);
    l.tick(2, 0, p);
    expect(l.surfaceAt(40)).toBe(-1);
    // and a new array is read in full
    l.setTerrain(t.slice(), []);
    l.tick(3, 0, p);
    expect(l.surfaceAt(40)).toBe(10);
  });

  it('finds the surface row and stays flat when nothing touches it', () => {
    const l = make(WATER);
    const p = new Particles(100);
    for (let t = 0; t < 50; t++) l.tick(t, 0, p);
    expect(l.surfaceAt(5)).toBe(10);
    expect(l.surfaceAt(-1)).toBe(-1);
    for (let x = 0; x < W; x++) expect(l.heightAt(x)).toBe(0);
  });

  it('a splash sends waves out both ways that die down, the same every time', () => {
    const run = () => {
      const l = make(WATER);
      const p = new Particles(100);
      l.tick(0, 0, p);
      l.disturb(30, 10, 2);
      const seen: number[] = [];
      for (let t = 1; t < 200; t++) {
        l.tick(t, 0, p);
        if (t === 20) {
          // the wave has reached columns away from the hit
          expect(Math.abs(l.heightAt(22)) + Math.abs(l.heightAt(38))).toBeGreaterThan(0.05);
        }
        seen.push(l.heightAt(30));
      }
      // and the pool settles
      expect(Math.abs(l.heightAt(30))).toBeLessThan(0.3);
      return seen;
    };
    expect(run()).toEqual(run());
  });

  it('waves stop at the bank', () => {
    const colors = new Uint32Array(256);
    colors[WATER] = 0x3a78c8;
    const l = new LiquidSurface(W, H, [WATER], [], [], colors);
    l.setTerrain(terrain(WATER, 0, 29));
    const p = new Particles(100);
    l.tick(0, 0, p);
    l.blast(25, 8, 6);
    for (let t = 1; t < 60; t++) l.tick(t, 0, p);
    expect(l.surfaceAt(35)).toBe(-1);
    expect(l.heightAt(35)).toBe(0);
  });

  it('lava bubbles throw embers and the surface draws whole cells', () => {
    const l = make(LAVA);
    const embers: number[] = [];
    const sink = { add: (e: Emit) => embers.push(e.kind) };
    for (let t = 0; t < 600; t++) l.tick(t, 0, sink);
    expect(embers.length).toBeGreaterThan(0);
    expect(embers.every((k) => k === PKind.Ember)).toBe(true);
    const n = recorder();
    const a = recorder();
    l.draw(n.batch, a.batch, 600);
    expect(n.out.length + a.out.length).toBeGreaterThan(0);
    for (const q of [...n.out, ...a.out]) {
      expect(q[0]! % 1).toBe(0.5);
      expect(q[1]! % 1).toBe(0.5);
      expect(q[2]).toBe(1);
      expect(q[3]).toBe(1);
    }
  });
});
