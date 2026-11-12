import { describe, expect, it } from 'vitest';
import type { EffectEvent, EntityView, RenderSnapshot } from '@mudders/shared';
import { Critters, mapSeed, type CritterProbe } from './critters';
import type { Emit, ParticleSink } from './particles';

const W = 600;
const H = 200;
/** Flat ground at row 150, with a lake from x 400 to 500 down to row 180 (surface row 150). */
function world(): { probe: CritterProbe; terrain: Uint8Array } {
  const terrain = new Uint8Array(W * H);
  for (let y = 150; y < H; y++) {
    for (let x = 0; x < W; x++) terrain[y * W + x] = x >= 400 && x < 500 && y < 180 ? 2 : 1;
  }
  const probe: CritterProbe = {
    width: W,
    height: H,
    solid: (x, y) => x >= 0 && y >= 0 && x < W && y < H && terrain[y * W + x] !== 0,
    liquid: (x, y) => x >= 0 && y >= 0 && x < W && y < H && terrain[y * W + x] === 2,
  };
  return { probe, terrain };
}

class Sink implements ParticleSink {
  readonly got: Emit[] = [];
  add(e: Emit): void {
    this.got.push(e);
  }
}

const snap = (tick: number, effectEvents: EffectEvent[] = [], entities: EntityView[] = []) =>
  ({ tick, turn: 1, effectEvents, entities }) as unknown as RenderSnapshot;

const boom = (tick: number, x: number, y: number, radius: number): EffectEvent => ({
  type: 'burst',
  tick,
  x,
  y,
  radius,
  params: {},
});

describe('Critters', () => {
  it('puts rabbits on dry ground clear of the tanks, and fish in the lake', () => {
    const { probe } = world();
    const c = new Critters();
    c.populate(probe, [100], 42);
    expect(c.rabbits.length).toBeGreaterThanOrEqual(3);
    for (const r of c.rabbits) {
      expect(r.y).toBe(150);
      expect(Math.abs(r.x - 100)).toBeGreaterThanOrEqual(45);
      expect(r.x < 400 || r.x >= 500).toBe(true);
    }
    expect(c.fish.length).toBeGreaterThan(0);
    for (const f of c.fish) expect(probe.liquid(Math.floor(f.x), Math.floor(f.y))).toBe(true);
  });

  it('places the same animals for the same seed', () => {
    const { probe, terrain } = world();
    const seed = mapSeed(terrain, W, H, 0);
    const a = new Critters();
    const b = new Critters();
    a.populate(probe, [], seed);
    b.populate(probe, [], seed);
    expect(a.rabbits).toEqual(b.rabbits);
    expect(a.fish).toEqual(b.fish);
    expect(mapSeed(terrain, W, H, 1)).not.toBe(seed);
  });

  it('rabbits stay on the ground and inside the map while they wander', () => {
    const { probe } = world();
    const c = new Critters();
    c.populate(probe, [], 7);
    const sink = new Sink();
    for (let t = 1; t < 3000; t++) c.step(snap(t), probe, sink);
    for (const r of c.rabbits) {
      expect(r.x).toBeGreaterThanOrEqual(8);
      expect(r.x).toBeLessThan(W - 8);
      // never wandered into the lake
      expect(r.x < 400 || r.x >= 500).toBe(true);
    }
  });

  it('a blast on a rabbit turns it into black pixels; farther ones bolt away', () => {
    const { probe } = world();
    const c = new Critters();
    c.populate(probe, [], 7);
    const target = c.rabbits[0]!;
    const n = c.rabbits.length;
    const sink = new Sink();
    c.step(snap(1, [boom(1, target.x, target.y - 1, 10)]), probe, sink);
    expect(c.rabbits.length).toBe(n - 1);
    expect(sink.got.length).toBeGreaterThan(10);
  });

  it('a blast in the lake kills the fish near it and they float up', () => {
    const { probe } = world();
    const c = new Critters();
    c.populate(probe, [], 7);
    const f = c.fish[0]!;
    const sink = new Sink();
    c.step(snap(1, [boom(1, f.x, f.y, 8)]), probe, sink);
    for (let t = 2; t < 300; t++) c.step(snap(t), probe, sink);
    expect(Math.floor(f.y)).toBe(150);
  });

  it('a falling shell sends a rabbit running away from it', () => {
    const { probe } = world();
    const c = new Critters();
    c.populate(probe, [], 7);
    const r = c.rabbits[0]!;
    const x0 = r.x;
    const shell = { kind: 'projectile', x: x0 - 20, y: 100 } as unknown as EntityView;
    const sink = new Sink();
    for (let t = 1; t < 40; t++) c.step(snap(t, [], [shell]), probe, sink);
    expect(r.x).toBeGreaterThan(x0 + 10);
  });

  it('crows fly in to a wreck, perch on it, and a blast sends them off', () => {
    const { probe } = world();
    const c = new Critters();
    c.populate(probe, [], 7);
    const wreck = {
      kind: 'tank',
      player: 1,
      x: 300,
      y: 150,
      alive: false,
    } as unknown as EntityView;
    const sink = new Sink();
    let t = 1;
    for (; t < 2000; t++) c.step(snap(t, [], [wreck]), probe, sink);
    expect(c.crows.length).toBeGreaterThanOrEqual(2);
    for (const k of c.crows) {
      expect(Math.abs(k.x - 300)).toBeLessThan(10);
      expect(k.y).toBeLessThan(150);
    }
    c.step(snap(t, [boom(t, 320, 150, 10)], [wreck]), probe, sink);
    for (let u = t + 1; u < t + 200; u++) c.step(snap(u, [], [wreck]), probe, sink);
    for (const k of c.crows) expect(Math.abs(k.x - 300) > 10 || k.y < 100).toBe(true);
  });
});
