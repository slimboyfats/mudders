import { describe, expect, it } from 'vitest';
import { Hasher, canonicalJson } from './hash';

describe('Hasher', () => {
  it('is stable and sensitive', () => {
    const a = new Hasher()
      .num(1)
      .str('x')
      .bytes(new Uint8Array([1, 2, 3, 4, 5]))
      .hex();
    expect(
      new Hasher()
        .num(1)
        .str('x')
        .bytes(new Uint8Array([1, 2, 3, 4, 5]))
        .hex(),
    ).toBe(a);
    expect(
      new Hasher()
        .num(1)
        .str('x')
        .bytes(new Uint8Array([1, 2, 3, 4, 6]))
        .hex(),
    ).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashes large, negative and fractional numbers distinctly', () => {
    const hs = [2 ** 40, -5, 0.5, -0.5, 0].map((v) => new Hasher().num(v).hex());
    expect(new Set(hs).size).toBe(hs.length);
  });

  it('hashes bytes as their length, then little-endian words, then the odd bytes', () => {
    const buf = new Uint8Array(1024).map((_, i) => (Math.imul(i + 3, 2654435761) >>> 24) & 255);
    // word-aligned and not, with and without bytes left over
    for (const view of [buf.subarray(0, 1000), buf.subarray(4, 1007), buf.subarray(1, 998)]) {
      const want = new Hasher().u32(view.length);
      const words = view.length >>> 2;
      for (let w = 0; w < words; w++) {
        const i = w * 4;
        want.u32(view[i]! | (view[i + 1]! << 8) | (view[i + 2]! << 16) | (view[i + 3]! << 24));
      }
      for (let i = words * 4; i < view.length; i++) want.u32(view[i]!);
      expect(new Hasher().bytes(view).hex()).toBe(want.hex());
    }
  });

  it('handles unaligned byte views', () => {
    const buf = new Uint8Array(9).map((_, i) => i);
    const view = buf.subarray(1);
    expect(new Hasher().bytes(view).hex()).toBe(new Hasher().bytes(view.slice()).hex());
  });
});

describe('canonicalJson', () => {
  it('ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } })).toBe(
      canonicalJson({ a: { c: 2, d: [1, { y: 2, z: 1 }] }, b: 1 }),
    );
  });
});
