import { describe, expect, it } from 'vitest';
import type { EffectEvent } from '@mudders/shared';
import { BLAST_SHAPES, BlastStyle, blastShape, FIRE_RGB } from './blast-styles';
import { EffectSystem } from './effects';
import { PKind, type Emit } from './particles';

/** Flat ground at row 150 on a 400×200 map. */
const probe = {
  width: 400,
  height: 200,
  material: (_x: number, y: number) => (y >= 150 ? 1 : 0),
  color: () => 0x806040,
};

const burst = (style: number, tick = 0): EffectEvent => ({
  type: 'burst',
  tick,
  x: 200,
  y: 149,
  radius: 20,
  params: { count: 40, style },
});

function setup(): { fx: EffectSystem; out: Emit[] } {
  const out: Emit[] = [];
  const fx = new EffectSystem({ add: (e) => void out.push(e) }, { splat: () => undefined }, probe);
  return { fx, out };
}

const bangs = (out: Emit[]): Emit[] => out.filter((e) => e.kind === PKind.Bang);

describe('explosion designs', () => {
  it('has a shape for every style, and unknown styles draw the plain blast', () => {
    expect(BLAST_SHAPES.length).toBe(Object.keys(BlastStyle).length);
    expect(blastShape(99)).toBe(BLAST_SHAPES[0]);
    expect(blastShape(undefined)).toBe(BLAST_SHAPES[0]);
  });

  it('Lance throws most of the bang to one side, low; the plain blast is even', () => {
    const plain = setup();
    plain.fx.handle(burst(BlastStyle.Plain));
    const lance = setup();
    lance.fx.handle(burst(BlastStyle.Lance));
    const right = (es: Emit[]) => es.filter((e) => e.vx > 0.3).length / es.length;
    expect(Math.abs(right(bangs(plain.out)) - right(bangs(lance.out)))).toBeGreaterThan(0.2);
  });

  it('Fountain punches the bang straight up', () => {
    const { fx, out } = setup();
    fx.handle(burst(BlastStyle.Fountain));
    const b = bangs(out);
    const up = b.filter((e) => e.vy < -2 * Math.abs(e.vx)).length / b.length;
    expect(up).toBeGreaterThan(0.5);
    // and sparks fly high enough to rain back down
    expect(out.some((e) => e.kind === PKind.Spark && e.vy < -3)).toBe(true);
  });

  it('chemical flames carry their colour; plain fire keeps the fire ramp', () => {
    const acid = setup();
    acid.fx.handle(burst(BlastStyle.Acid));
    expect(bangs(acid.out).every((e) => e.color === BLAST_SHAPES[BlastStyle.Acid]!.tint)).toBe(
      true,
    );
    const plain = setup();
    plain.fx.handle(burst(BlastStyle.Plain));
    expect(bangs(plain.out).every((e) => e.color === FIRE_RGB)).toBe(true);
  });

  it('Dirty is mostly ground: less bang, more grains', () => {
    const plain = setup();
    plain.fx.handle(burst(BlastStyle.Plain));
    const dirty = setup();
    dirty.fx.handle(burst(BlastStyle.Dirty));
    const grains = (es: Emit[]) => es.filter((e) => e.kind === PKind.Chunk).length;
    expect(bangs(dirty.out).length).toBeLessThan(bangs(plain.out).length * 0.5);
    expect(grains(dirty.out)).toBeGreaterThan(grains(plain.out) * 1.5);
  });

  it('Cracker pops go off after the blast, then stop', () => {
    const { fx, out } = setup();
    fx.handle(burst(BlastStyle.Cracker));
    const first = bangs(out).length;
    for (let t = 1; t <= 120; t++) fx.tick(t);
    const after = bangs(out).length;
    expect(after).toBeGreaterThan(first);
    for (let t = 121; t <= 200; t++) fx.tick(t);
    expect(bangs(out).length).toBe(after);
  });
});
