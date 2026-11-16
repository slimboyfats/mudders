import { describe, expect, it } from 'vitest';
import { LANE_BOUNDS, ParticleLanes } from './particle-lanes';

/** Small seeded generator. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slotsOf(segs: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (let g = 0; g < segs.length; g += 2) {
    for (let i = 0; i < segs[g + 1]!; i++) out.add(segs[g]! + i);
  }
  return out;
}

describe('particle lanes', () => {
  it('keeps every living particle inside a window and never hands out a living slot', () => {
    const lanes = new ParticleLanes(4000);
    const rnd = seeded(7);
    const dies = new Map<number, number>();
    for (let tick = 1; tick <= 3000; tick++) {
      for (const [slot, at] of dies) if (at <= tick) dies.delete(slot);
      const n = Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        const life = rnd() < 0.05 ? 1400 : rnd() < 0.5 ? 20 + Math.floor(rnd() * 40) : 200;
        const slot = lanes.put(tick, life);
        expect(dies.has(slot)).toBe(false);
        dies.set(slot, tick + life);
      }
      const pending = slotsOf(lanes.takePending());
      expect(lanes.takePending().length).toBe(0);
      if (n > 0) expect(pending.size).toBe(n);
      lanes.step(tick);
      if (tick % 7 !== 0) continue;
      const win = slotsOf(lanes.segments());
      expect(win.size).toBe(lanes.n);
      let missing = 0;
      for (const [slot, at] of dies) if (at > tick && !win.has(slot)) missing++;
      expect(missing).toBe(0);
    }
  });

  it('does not let a long-lived particle keep dead short-lived ones in the windows', () => {
    const lanes = new ParticleLanes(100000);
    // snow: a flake a tick that lives 1400, and forty sparks a tick that live 40
    for (let tick = 1; tick <= 3000; tick++) {
      lanes.put(tick, 1400);
      for (let i = 0; i < 40; i++) lanes.put(tick, 40);
      lanes.step(tick);
    }
    // alive: 1400 flakes and 1600 sparks; one ring would hold 1400 ticks of everything (57 400)
    expect(lanes.n).toBeLessThan(3100);
  });

  it('overwrites the oldest of a full lane only', () => {
    const lanes = new ParticleLanes(80);
    const long = lanes.put(1, LANE_BOUNDS[2] + 500);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(lanes.put(1, 30));
    expect(seen.size).toBe(40); // half the capacity is the shortest lane's
    expect(seen.has(long)).toBe(false);
    lanes.step(2);
    expect(slotsOf(lanes.segments()).has(long)).toBe(true);
  });

  it('rewinds once everything has died', () => {
    const lanes = new ParticleLanes(100);
    lanes.put(1, 10);
    lanes.put(1, 300);
    expect(lanes.step(5)).toBe(true);
    expect(lanes.step(301)).toBe(false);
    expect(lanes.n).toBe(0);
    expect(lanes.segments().length).toBe(0);
  });
});
