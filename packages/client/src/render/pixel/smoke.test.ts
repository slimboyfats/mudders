import { describe, expect, it } from 'vitest';
import type { EffectEvent } from '@mudders/shared';
import type { QuadBatch } from './batch';
import { EffectSystem, SMOKE_COLUMN_MIN_R } from './effects';
import { Particles, PKind } from './particles';

/** Flat ground at row 150 on a 400×200 map. */
const probe = {
  width: 400,
  height: 200,
  material: (_x: number, y: number) => (y >= 150 ? 1 : 0),
  color: () => 0x806040,
};

const flash = (tick: number, x: number, radius: number, dt = 0): EffectEvent => ({
  type: 'flash',
  tick,
  x,
  y: 140,
  radius,
  params: { strength: 1, dt },
});

type Splat = { x: number; y: number; vy: number; smoke: number; heat: number };

function setup(): { fx: EffectSystem; p: Particles; splats: Splat[] } {
  const p = new Particles(6000);
  const splats: Splat[] = [];
  const fluid = {
    splat: (
      x: number,
      y: number,
      _r: number,
      _vx: number,
      vy: number,
      smoke: number,
      heat: number,
    ) => void splats.push({ x, y, vy, smoke, heat }),
  };
  return { fx: new EffectSystem(p, fluid, probe), p, splats };
}

/** x positions of every drawn particle. */
function drawnX(p: Particles): number[] {
  const xs: number[] = [];
  const batch = { push: (x: number) => void xs.push(x) } as unknown as QuadBatch;
  p.draw(batch, batch);
  return xs;
}

describe('smoke columns', () => {
  it('only big fire, blast and kinetic hits leave a column', () => {
    const { fx } = setup();
    fx.handle(flash(0, 100, SMOKE_COLUMN_MIN_R - 1));
    fx.handle(flash(0, 200, 24, 3)); // cold
    fx.handle(flash(0, 300, 24, 5)); // dig
    expect(fx.columns.length).toBe(0);
    fx.handle(flash(0, 300, 24, 2)); // heat
    expect(fx.columns.length).toBe(1);
    // rooted on the ground, not at the blast centre
    expect(fx.columns[0]!.y).toBe(149);
  });

  it('blasts landing on a fresh column feed it instead of stacking', () => {
    const { fx } = setup();
    fx.handle(flash(0, 200, 24));
    fx.handle(flash(10, 210, 24));
    fx.handle(flash(12, 190, 24));
    expect(fx.columns.length).toBe(1);
    expect(fx.columns[0]!.r).toBeGreaterThan(24);
    fx.handle(flash(12, 330, 24));
    expect(fx.columns.length).toBe(2);
  });

  it('pours hot soot into the fluid, thinning out, then clears', () => {
    const { fx, splats } = setup();
    fx.handle(flash(0, 200, 30));
    const dur = fx.columns[0]!.dur;
    expect(dur).toBeGreaterThan(600);
    for (let t = 0; t < 100; t++) fx.tick(t);
    const young = splats.filter((s) => Math.abs(s.x - 200) < 30);
    expect(young.length).toBe(100);
    // rooted on the ground, rising, hot at first
    for (const s of young) {
      expect(s.y).toBe(147);
      expect(s.vy).toBeLessThan(0);
    }
    expect(young[0]!.heat).toBeGreaterThan(0.1);
    splats.length = 0;
    for (let t = 100; t < dur + 100; t++) fx.tick(t);
    const old = splats.filter((s) => Math.abs(s.x - 200) < 30);
    expect(old[old.length - 1]!.smoke).toBeLessThan(young[0]!.smoke * 0.2);
    expect(fx.columns.length).toBe(0);
  });

  it('sooty puffs from any effect go into the fluid, coloured puffs stay particles', () => {
    const { fx, p, splats } = setup();
    // a tank death throws a dozen grey puffs: pooled into a splat or two, not particles
    fx.handle({ type: 'tankDeath', tick: 0, x: 200, y: 140, radius: 10, params: {} });
    const before = p.n;
    const puffs = p.count(PKind.Smoke);
    fx.tick(0);
    const pooled = splats.filter((s) => s.smoke > 0 && Math.abs(s.x - 200) < 30);
    expect(pooled.length).toBeGreaterThan(0);
    expect(pooled.length).toBeLessThanOrEqual(8);
    // (the tick lets go fire cells for the blast's two rolls; no smoke puffs)
    expect(p.count(PKind.Smoke)).toBe(puffs);
    // frost mist is pale and stays a particle
    fx.handle({ type: 'frostBlast', tick: 1, x: 300, y: 140, radius: 20, params: {} });
    expect(p.n).toBeGreaterThan(before);
  });

  it('is the same every run (seeded from the event)', () => {
    const run = (): [number[], Splat[]] => {
      const { fx, p, splats } = setup();
      fx.handle(flash(5, 200, 40));
      for (let t = 5; t < 200; t++) {
        p.step(0.05, -0.006);
        fx.tick(t);
      }
      return [drawnX(p), splats];
    };
    expect(run()).toEqual(run());
  });
});
