/**
 * Fast 64-bit (two-lane) non-cryptographic hash for state hashes and content hashes. Integer-only
 * (`Math.imul`), so identical on every engine.
 */
/** Whether a `Uint32Array` over bytes reads them as little-endian words (true on every phone and PC). */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

export class Hasher {
  private h1 = 0x9747b28c | 0;
  private h2 = 0x85ebca6b | 0;

  u32(v: number): this {
    const k = v | 0;
    let h1 = Math.imul(this.h1 ^ k, 0xcc9e2d51);
    h1 = (h1 << 15) | (h1 >>> 17);
    let h2 = Math.imul(this.h2 ^ k, 0x1b873593);
    h2 = (h2 << 13) | (h2 >>> 19);
    this.h1 = (h1 + h2) | 0;
    this.h2 = (h2 + Math.imul(h1, 5) + 0xe6546b64) | 0;
    return this;
  }

  /** Any finite number. Integers in the safe range hash as two words; others via float bits. */
  num(v: number): this {
    if (Number.isSafeInteger(v)) {
      const lo = v % 4294967296;
      return this.u32(lo).u32((v - lo) / 4294967296);
    }
    const f = new Float64Array([v]);
    const u = new Uint32Array(f.buffer);
    return this.u32(0x7ff00000).u32(u[0]!).u32(u[1]!);
  }

  /**
   * Bytes as little-endian words. The mix is `u32`'s, run on locals: a grid layer is hundreds of
   * thousands of words, and this is hashed every two seconds of online play. Where the machine is
   * little-endian and the bytes are word-aligned the words are read straight from memory; else
   * they are composed by hand, so alignment and endianness never change the result.
   */
  bytes(arr: Uint8Array): this {
    const n = arr.length;
    this.u32(n);
    const words = n >>> 2;
    let h1 = this.h1;
    let h2 = this.h2;
    if (LITTLE_ENDIAN && (arr.byteOffset & 3) === 0) {
      const v = new Uint32Array(arr.buffer, arr.byteOffset, words);
      for (let w = 0; w < words; w++) {
        const k = v[w]! | 0;
        let a = Math.imul(h1 ^ k, 0xcc9e2d51);
        a = (a << 15) | (a >>> 17);
        let b = Math.imul(h2 ^ k, 0x1b873593);
        b = (b << 13) | (b >>> 19);
        h1 = (a + b) | 0;
        h2 = (b + Math.imul(a, 5) + 0xe6546b64) | 0;
      }
    } else {
      for (let w = 0, i = 0; w < words; w++, i += 4) {
        const k = arr[i]! | (arr[i + 1]! << 8) | (arr[i + 2]! << 16) | (arr[i + 3]! << 24);
        let a = Math.imul(h1 ^ k, 0xcc9e2d51);
        a = (a << 15) | (a >>> 17);
        let b = Math.imul(h2 ^ k, 0x1b873593);
        b = (b << 13) | (b >>> 19);
        h1 = (a + b) | 0;
        h2 = (b + Math.imul(a, 5) + 0xe6546b64) | 0;
      }
    }
    this.h1 = h1;
    this.h2 = h2;
    for (let i = words * 4; i < n; i++) this.u32(arr[i]!);
    return this;
  }

  str(s: string): this {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
    return this;
  }

  hex(): string {
    const fmix = (h: number): number => {
      h ^= h >>> 16;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      return (h ^ (h >>> 16)) >>> 0;
    };
    const a = fmix(this.h1 ^ this.h2);
    const b = fmix(this.h2 + a);
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }
}

/** JSON with recursively sorted object keys, so equal data always hashes equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) out[k] = src[k];
      return out;
    }
    return v;
  });
}
