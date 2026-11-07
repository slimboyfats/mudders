import type { EffectEvent, RenderSnapshot, TankView } from '@mudders/shared';
import { describe, expect, it } from 'vitest';
import {
  HOLD_COOLDOWN,
  HitStop,
  MAX_HOLD,
  TANK_DEATH_HOLD,
  blastHold,
  blastShake,
  eventHold,
  shakeTicks,
} from './impact';

const flash = (radius: number, tick = 10, x = 100, y = 100, strength = 1): EffectEvent => ({
  type: 'flash',
  tick,
  x,
  y,
  radius,
  params: { strength },
});

const tank = (x: number, y: number, health = 100) =>
  ({ kind: 'tank', player: 0, x, y, health }) as unknown as TankView;

const snap = (tick: number, events: EffectEvent[], entities: TankView[] = []): RenderSnapshot =>
  ({ tick, effectEvents: events, entities }) as unknown as RenderSnapshot;

describe('impact scaling', () => {
  it('shakes harder and longer for bigger blasts', () => {
    expect(blastShake(6)).toBe(0);
    expect(blastShake(24)).toBeGreaterThan(blastShake(12));
    expect(blastShake(80)).toBeGreaterThan(blastShake(24));
    expect(blastShake(500)).toBe(10);
    expect(blastShake(40, 0)).toBe(0);
    expect(shakeTicks(blastShake(80))).toBeGreaterThan(shakeTicks(blastShake(24)));
  });

  it('holds only on big hits, capped', () => {
    expect(blastHold(12)).toBe(0);
    expect(blastHold(24)).toBeGreaterThan(0);
    expect(blastHold(60)).toBeGreaterThan(blastHold(24));
    expect(blastHold(200)).toBe(MAX_HOLD);
    expect(blastHold(80, 0)).toBe(0);
  });

  it('holds longer when a live tank is caught in the blast', () => {
    const e = flash(24);
    expect(eventHold(e, [tank(110, 104)])).toBeGreaterThan(eventHold(e, []));
    expect(eventHold(e, [tank(300, 104)])).toBe(eventHold(e, []));
    expect(eventHold(e, [tank(110, 104, 0)])).toBe(eventHold(e, []));
    expect(eventHold({ ...e, type: 'tankDeath' }, [])).toBe(TANK_DEATH_HOLD);
    expect(eventHold({ ...e, type: 'burst' }, [])).toBe(0);
  });
});

describe('HitStop', () => {
  it('eats wall-clock time while holding and counts it as held', () => {
    const s = new HitStop();
    const hold = s.feed(snap(10, [flash(60, 10)]));
    expect(hold).toBe(blastHold(60));
    expect(s.holding).toBe(true);
    const step = 1000 / 60;
    let sim = 0;
    for (let i = 0; i < 20; i++) sim += s.take(step);
    expect(s.held).toBeCloseTo(hold);
    expect(sim).toBeCloseTo((20 - hold) * step);
    expect(s.holding).toBe(false);
    expect(s.take(step)).toBe(step);
  });

  it('does not stutter on a cluster of hits, but a bigger one still holds', () => {
    const s = new HitStop();
    expect(s.feed(snap(10, [flash(30, 10)]))).toBeGreaterThan(0);
    s.take(1000);
    expect(s.feed(snap(14, [flash(30, 14)]))).toBe(0);
    expect(s.feed(snap(16, [flash(80, 16)]))).toBeGreaterThan(0);
    s.take(1000);
    expect(s.feed(snap(16 + HOLD_COOLDOWN, [flash(30, 16 + HOLD_COOLDOWN)]))).toBeGreaterThan(0);
  });

  it('does nothing when switched off', () => {
    const s = new HitStop(false);
    expect(s.feed(snap(10, [flash(80, 10)]))).toBe(0);
    expect(s.take(16)).toBe(16);
    expect(s.held).toBe(0);
  });
});
