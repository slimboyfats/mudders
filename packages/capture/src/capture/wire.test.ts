import { describe, expect, it } from 'vitest';
import type { RenderSnapshot } from '@mudders/shared';
import { toWire } from './wire';

describe('toWire', () => {
  it('packs dirty rects as row-major patches', () => {
    const terrain = new Uint8Array(4 * 3);
    terrain.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const s: RenderSnapshot = {
      tick: 5,
      turn: 1,
      width: 4,
      height: 3,
      terrain,
      coating: new Uint8Array(12),
      dirtyRects: [{ x: 1, y: 1, w: 2, h: 2 }],
      entities: [],
      effectEvents: [],
      debris: {
        count: 1,
        x: Int32Array.of(7, 9),
        y: Int32Array.of(8, 9),
        material: Uint8Array.of(3, 4),
      },
      wind: 0,
      theme: 'theme.default',
    };
    const w = toWire(s);
    expect(w.patches).toHaveLength(1);
    const [x, y, pw, ph, b64] = w.patches[0]!;
    expect([x, y, pw, ph]).toEqual([1, 1, 2, 2]);
    expect([...Buffer.from(b64, 'base64')]).toEqual([6, 7, 10, 11]);
    expect(w.debris).toEqual({ x: [7], y: [8], m: [3] });
  });
});
