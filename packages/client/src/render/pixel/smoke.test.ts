import { describe, expect, it } from 'vitest';
import type { EffectEvent } from '@mudders/shared';
import type { QuadBatch } from './batch';
import { EffectSystem, SMOKE_COLUMN_MIN_R } from './effects';
import { Particles } from './particles';

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

function setup(): { fx: EffectSystem; p: Particles } {
  const p = new Particles(6000);
  return { fx: new EffectSystem(p, probe), p };
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

  it('leans downwind, lingers, then clears', () => {
    const { fx, p } = setup();
    fx.handle(flash(0, 200, 30));
    const dur = fx.columns[0]!.dur;
    expect(dur).toBeGreaterThan(600);
    for (let t = 0; t < 400; t++) {
      p.step(0.05, 0.01);
      fx.tick(t);
    }
    const xs = drawnX(p);
    expect(xs.length).toBeGreaterThan(20);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(215); // blown right
    for (let t = 400; t < dur + 400; t++) {
      p.step(0.05, 0.01);
      fx.tick(t);
    }
    expect(fx.columns.length).toBe(0);
    expect(p.n).toBe(0);
  });

  it('is the same every run (seeded from the event)', () => {
    const run = (): number[] => {
      const { fx, p } = setup();
      fx.handle(flash(5, 200, 40));
      for (let t = 5; t < 200; t++) {
        p.step(0.05, -0.006);
        fx.tick(t);
      }
      return drawnX(p);
    };
    expect(run()).toEqual(run());
  });
});
