import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { World } from '@mudders/sim';
import { coach, reportShot, suggestAim, type ShotReport } from './coach';
import { TrainingRun, rangeFor, trainingRange } from './training';
import { challengeOptions } from './challenges';

const content = loadContent();

function range(seed: number, wind: 'calm' | 'steady' | 'changing' = 'calm') {
  const w = new World(content, trainingRange(content, seed, wind).options);
  const me = w.tanks[0]!;
  const foe = w.tanks[1]!;
  const dir = Math.sign(foe.x - me.x);
  return { w, me, foe, dir, side: (a: number) => (dir > 0 ? a : 180 - a) };
}

/** Fires one shot and steps until it is your turn again (or the range ends). */
function fire(w: World, run: TrainingRun, angle: number, power: number) {
  w.applyInput(0, { type: 'aim', angle, power });
  w.applyInput(0, { type: 'fire' });
  for (let i = 0; i < 4000; i++) {
    w.step();
    run.observe(w);
    if (run.state !== 'playing' || (w.phase === 'aim' && run.card)) return;
  }
  throw new Error('turn never came back');
}

describe('training ranges', () => {
  it('are drawn the same from the same seed, on either side', () => {
    expect(rangeFor(5, 'calm')).toEqual(rangeFor(5, 'calm'));
    const sides = new Set(
      Array.from({ length: 16 }, (_, i) => {
        const c = rangeFor(i + 1, 'calm');
        return Math.sign(c.foes[0]!.x - c.you.x);
      }),
    );
    expect(sides).toEqual(new Set([-1, 1]));
  });

  it('can always be hit with a plain missile from the start', () => {
    for (const wind of ['calm', 'steady', 'changing'] as const)
      for (let s = 1; s <= 4; s++) {
        const { w, me, side } = range(s * 977, wind);
        expect(suggestAim(w, me, me.weapon, 1, { angle: side(45), power: 600 })).not.toBeNull();
      }
  });
});

describe('shot coach', () => {
  it('reads short, long, wrong way and a hit', () => {
    const { w, me, side } = range(3000);
    const hit = suggestAim(w, me, me.weapon, 1, { angle: side(45), power: 600 })!;
    const at = (angle: number, power: number) =>
      reportShot(w, me, { angle, power, weapon: me.weapon })!;
    expect(at(hit.angle, hit.power).result).toBe('hit');
    const short = at(hit.angle, hit.power - 150);
    expect(short.result).toBe('short');
    expect(short.missBy).toBeLessThan(0);
    expect(short.per50).toBeGreaterThan(0);
    const long = at(hit.angle, Math.min(1000, hit.power + 150));
    expect(long.result).toBe('long');
    expect(long.missBy).toBeGreaterThan(0);
    expect(at(180 - hit.angle, hit.power).result).toBe('away');
    // the coach turns a short shot into "add power"
    const c = coach(short, suggestAim(w, me, me.weapon, 1, short));
    expect(c.headline).toMatch(/short/);
    expect(c.next).toMatch(/add about \d+ power/);
    expect(c.suggest).not.toBeNull();
  });

  it('leaves the world as it was (wind put back, nothing stepped)', () => {
    const { w, me, side } = range(77, 'steady');
    const base = w.windBase;
    const hash = w.hash();
    reportShot(w, me, { angle: side(50), power: 500, weapon: me.weapon });
    suggestAim(w, me, me.weapon, 1, { angle: side(50), power: 500 });
    expect(w.windBase).toBe(base);
    expect(w.hash()).toBe(hash);
  });

  it('blames the wind when still air would have hit', () => {
    // a strong steady wind; aim that hits in still air
    const c = { ...rangeFor(11, 'calm'), wind: 0.011 };
    const w = new World(content, challengeOptions(c, content));
    const me = w.tanks[0]!;
    const dir = Math.sign(w.tanks[1]!.x - me.x);
    const base = w.windBase;
    w.windBase = 0;
    const still = suggestAim(w, me, me.weapon, 1, { angle: dir > 0 ? 60 : 120, power: 600 })!;
    w.windBase = base;
    const r = reportShot(w, me, { ...still, weapon: me.weapon })!;
    expect(r.result).not.toBe('hit');
    expect(r.windOnly).toBe(true);
    expect(Math.abs(r.windDrift)).toBeGreaterThan(5);
    expect(coach(r, null).why.join(' ')).toMatch(/wind/i);
  });

  it('spots a bracket and splits the difference', () => {
    const base: ShotReport = {
      angle: 45,
      power: 500,
      weapon: 0,
      target: 1,
      result: 'short',
      missBy: -40,
      windDrift: 0,
      windOnly: false,
      blocked: false,
      per50: 30,
      wind: 0,
      lost: false,
    };
    const c = coach({ ...base, power: 620, result: 'long', missBy: 30 }, null, [base]);
    expect(c.next).toMatch(/bracketed.*560 power/);
  });

  it('coaches a whole range: a miss, then the suggested aim clears it', () => {
    const { w, side } = range(3000);
    const run = new TrainingRun();
    fire(w, run, side(45), 350);
    expect(run.state).toBe('playing');
    const card = run.card!;
    expect(card.tone).not.toBe('good');
    expect(card.next.length).toBeGreaterThan(0);
    expect(card.suggest).not.toBeNull();
    fire(w, run, card.suggest!.angle, card.suggest!.power);
    expect(run.state).toBe('cleared');
    expect(run.shots).toBe(2);
    expect(run.card?.tone).toBe('good');
  });
});
