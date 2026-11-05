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
