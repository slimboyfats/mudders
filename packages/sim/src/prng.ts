/**
 * Seeded PRNG owned by match state (§6.3): sfc32, seeded through splitmix32. The only source of
 * randomness in the sim. State is four uint32 words, included in the state hash.
 */
export class Prng {
  readonly state = new Uint32Array(4);

  constructor(seed: number) {
    let z = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
      this.state[i] = (t ^ (t >>> 15)) >>> 0;
    }
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32(): number {
    const s = this.state;
    let a = s[0]!;
    let b = s[1]!;
    let c = s[2]!;
    let d = s[3]!;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    s[0] = a;
    s[1] = b;
    s[2] = c;
    s[3] = d;
    return t >>> 0;
  }

  /** Integer in [0, n). `n` must be ≤ 2^21 so the product stays exact. */
  int(n: number): number {
    return Math.floor((this.nextU32() * n) / 4294967296);
  }

  /** Integer in [lo, hi], inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability num/den. */
  chance(num: number, den: number): boolean {
    return this.int(den) < num;
  }

  /** Fisher–Yates shuffle in place. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
}
