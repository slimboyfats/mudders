import { describe, expect, it } from 'vitest';
import type { EffectEvent } from '@mudders/shared';
import { BLAST_SHAPES, BlastStyle, blastShape, FIRE_RGB, landingStyle } from './blast-styles';
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

  it('a landing-picked blast follows how the shell landed', () => {
    const at = (side: number, buried = false, airborne = false) =>
      landingStyle({ side, buried, airborne });
    expect(at(0)).toBe(BlastStyle.Fountain);
    expect(at(-0.3)).toBe(BlastStyle.Fountain);
    expect(at(0.7)).toBe(BlastStyle.Plain);
    expect(at(-1)).toBe(BlastStyle.Lance);
    expect(at(1, true)).toBe(BlastStyle.Dirty);
    expect(at(0, false, true)).toBe(BlastStyle.Flash);
  });

  it('reads the landing off the ground: in the air, buried, plumb', () => {
    const style = (y: number) => {
      const { fx, out } = setup();
      fx.handle({ ...burst(BlastStyle.Landing), y, radius: 12 });
      return out;
    };
    // in the air: the Flash's rays and no fire at all
    expect(style(60).some((e) => e.kind === PKind.Fire)).toBe(false);
    // buried deep: a Dirty blast, hardly any bang
    const plain = setup();
    plain.fx.handle({ ...burst(BlastStyle.Plain), y: 175, radius: 12 });
    expect(bangs(style(175)).length).toBeLessThan(bangs(plain.out).length * 0.5);
    // a plumb hit on the surface (no shell seen): a Fountain, the bang thrown up
    const b = bangs(style(149));
    expect(b.filter((e) => e.vy < -2 * Math.abs(e.vx)).length / b.length).toBeGreaterThan(0.5);
  });

  it('Implode sucks in first and only goes off when it has all gone in', () => {
    const { fx, out } = setup();
    fx.handle(burst(BlastStyle.Implode));
    // every cell so far is heading in toward the point
    const inward = out.filter((e) => (e.x - 200) * e.vx + (e.y - 149) * e.vy < 0);
    expect(inward.length).toBe(out.length);
    expect(out.some((e) => e.kind === PKind.Fire)).toBe(false);
    for (let t = 1; t <= 20; t++) fx.tick(t);
    expect(out.some((e) => e.kind === PKind.Fire)).toBe(true);
  });

  it('Roll sends a ball of fire off along the ground', () => {
    const { fx, out } = setup();
    fx.handle(burst(BlastStyle.Roll));
    const n = out.length;
    for (let t = 1; t <= 40; t++) fx.tick(t);
    const later = out.slice(n).filter((e) => e.kind === PKind.Bang || e.kind === PKind.Fire);
    // the ball has rolled well clear of the blast, staying on the ground
    expect(Math.max(...later.map((e) => e.x))).toBeGreaterThan(200 + 40);
    expect(later.every((e) => e.y < 150)).toBe(true);
  });

  it('Carpet runs flames out along the ground both ways', () => {
    const { fx, out } = setup();
    fx.handle(burst(BlastStyle.Carpet));
    const n = out.length;
    for (let t = 1; t <= 30; t++) fx.tick(t);
    const xs = out.slice(n).map((e) => e.x);
    expect(Math.min(...xs)).toBeLessThan(200 - 40);
    expect(Math.max(...xs)).toBeGreaterThan(200 + 40);
  });

  it('Canopy and Shrapnel throw their own sprays', () => {
    const can = setup();
    can.fx.handle(burst(BlastStyle.Canopy));
    expect(
      can.out.filter((e) => e.kind === PKind.Spark && e.vy < -1.5 && e.life > 60).length,
    ).toBeGreaterThan(100);
    const sh = setup();
    sh.fx.handle(burst(BlastStyle.Shrapnel));
    expect(
      sh.out.filter((e) => e.kind === PKind.Spark && Math.hypot(e.vx, e.vy) > 3).length,
    ).toBeGreaterThan(80);
  });
});
