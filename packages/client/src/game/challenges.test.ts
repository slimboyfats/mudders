import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { World } from '@mudders/sim';
import {
  CHALLENGES,
  CHAPTERS,
  ChallengeRun,
  challengeOptions,
  isUnlocked,
  nextChallenge,
  starsFor,
} from './challenges';

const content = loadContent();
const build = (i: number) => {
  const c = CHALLENGES[i]!;
  return { c, w: new World(content, challengeOptions(c, content)) };
};

/**
 * Plays a target challenge greedily: every turn, the first angle/power whose predicted first
 * impact lands on a live target. Proves the set piece can be cleared on today's maps and physics.
 */
function solve(c: (typeof CHALLENGES)[number], w: World): ChallengeRun {
  const run = new ChallengeRun(c, w);
  const me = w.tanks[0]!;
  for (let guard = 0; guard < 30_000 && run.status.state === 'playing'; guard++) {
    if (w.phase === 'aim' && w.activePlayer === 0) {
      const weapon = me.inventory.findIndex((n) => n !== 0);
      let shot: [number, number] | null = null;
      search: for (let a = 20; a <= 88; a++)
        for (let p = 150; p <= 1000; p += 10)
          for (const angle of [a, 180 - a]) {
            const r = w.predict(me, weapon, angle, p);
            const t = w.tanks[r.tank];
            if (r.landed && t && t.player !== 0 && t.alive) {
              shot = [angle, p];
              break search;
            }
          }
      if (!shot) break;
      w.applyInput(0, { type: 'selectWeapon', weapon: w.weaponId(weapon) });
      w.applyInput(0, { type: 'aim', angle: shot[0], power: shot[1] });
      w.applyInput(0, { type: 'fire' });
    }
    w.step();
    run.observe(w);
  }
  return run;
}

/** Replays a challenge's stored solution. */
function replay(c: (typeof CHALLENGES)[number], w: World): ChallengeRun {
  const run = new ChallengeRun(c, w);
  const shots = [...(c.solution ?? [])];
  for (let guard = 0; guard < 40_000 && run.status.state === 'playing'; guard++) {
    if (w.phase === 'aim' && w.activePlayer === 0) {
      const s = shots.shift();
      if (!s) break;
      w.applyInput(0, { type: 'selectWeapon', weapon: s[0] });
      w.applyInput(0, { type: 'aim', angle: s[1], power: s[2] });
      w.applyInput(0, { type: 'fire' });
    }
    w.step();
    run.observe(w);
  }
  return run;
}

describe('solo challenges', () => {
  it('have unique ids and a known chapter', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) expect(CHAPTERS[c.chapter]).toBeDefined();
  });

  it('build a world with only the kit and targets that never take a turn', () => {
    for (let i = 0; i < CHALLENGES.length; i++) {
      const { c, w } = build(i);
      expect(w.tanks.length).toBe(1 + c.foes.length);
      const me = w.tanks[0]!;
      const kit = Object.keys(c.you.inventory).filter((id) => id.startsWith('weapon.'));
      const carried = me.inventory.flatMap((n, k) => (n !== 0 ? [w.weaponId(k)] : []));
      expect(carried.sort()).toEqual(kit.sort());
      // targets sit out of the turn order
      expect(w.activePlayer).toBe(0);
      c.foes.forEach((f, k) => {
        const t = w.tanks[k + 1]!;
        expect(t.bot >= 0).toBe(f.bot !== undefined);
        if (f.health) expect(t.health).toBe(f.health);
      });
    }
  });

  it('every target challenge can be cleared within its two-star shots (solution or solver)', () => {
    for (let i = 0; i < CHALLENGES.length; i++) {
      const { c, w } = build(i);
      if (c.foes.some((f) => f.bot)) continue;
      const run = c.solution ? replay(c, w) : solve(c, w);
      expect(run.status.state, c.id).toBe('won');
      if (c.stars.by === 'shots') expect(run.shots, c.id).toBeLessThanOrEqual(c.stars.two);
    }
  }, 120_000);

  it('bots in a duel shoot back', () => {
    const i = CHALLENGES.findIndex((c) => c.foes.some((f) => f.bot));
    const { c, w } = build(i);
    const run = new ChallengeRun(c, w);
    let botTurns = 0;
    let was = 0;
    for (let k = 0; k < 20_000 && run.status.state === 'playing' && botTurns < 2; k++) {
      if (w.phase === 'aim' && w.activePlayer === 0) {
        w.applyInput(0, { type: 'aim', angle: 80, power: 300 });
        w.applyInput(0, { type: 'fire' });
      }
      w.step();
      run.observe(w);
      if (w.activePlayer !== was && w.activePlayer !== 0) botTurns++;
      was = w.activePlayer;
    }
    expect(botTurns).toBeGreaterThan(0);
    expect(run.shots).toBeGreaterThan(0);
  }, 60_000);

  it('a sharp player can beat every bot challenge with plain missiles', () => {
    for (let i = 0; i < CHALLENGES.length; i++) {
      const { c, w } = build(i);
      if (!c.foes.some((f) => f.bot)) continue;
      const run = new ChallengeRun(c, w);
      const me = w.tanks[0]!;
      const missile = w.weaponByIndex('weapon.missile');
      for (let g = 0; g < 60_000 && run.status.state === 'playing'; g++) {
        if (w.phase === 'aim' && w.activePlayer === 0) {
          let shot: [number, number] = [60, 500];
          search: for (let a = 20; a <= 85; a++)
            for (let p = 200; p <= 1000; p += 10)
              for (const angle of [a, 180 - a]) {
                const r = w.predict(me, missile, angle, p);
                const t = w.tanks[r.tank];
                if (r.landed && t && t.player !== 0 && t.alive) {
                  shot = [angle, p];
                  break search;
                }
              }
          w.applyInput(0, { type: 'selectWeapon', weapon: 'weapon.missile' });
          w.applyInput(0, { type: 'aim', angle: shot[0], power: shot[1] });
          w.applyInput(0, { type: 'fire' });
        }
        w.step();
        run.observe(w);
      }
      expect(run.status.state, c.id).toBe('won');
    }
  }, 300_000);

  it('is lost when the shot budget runs out', () => {
    const { c, w } = build(0);
    const run = new ChallengeRun({ ...c, shots: 1 }, w);
    for (let k = 0; k < 6000 && run.status.state === 'playing'; k++) {
      // straight up and soft: never reaches the target
      if (w.phase === 'aim' && w.activePlayer === 0) {
        w.applyInput(0, { type: 'aim', angle: 90, power: 200 });
        w.applyInput(0, { type: 'fire' });
      }
      w.step();
      run.observe(w);
    }
    expect(run.status).toEqual({ state: 'lost', reason: 'Out of shots.' });
    expect(run.shots).toBe(1);
  });

  it('scores stars by shots or health left', () => {
    const shots = { ...CHALLENGES[0]!, stars: { by: 'shots', three: 1, two: 3 } as const };
    expect(starsFor(shots, 1, 100)).toBe(3);
    expect(starsFor(shots, 3, 100)).toBe(2);
    expect(starsFor(shots, 4, 100)).toBe(1);
    const health = { ...CHALLENGES[0]!, stars: { by: 'health', three: 75, two: 40 } as const };
    expect(starsFor(health, 9, 80)).toBe(3);
    expect(starsFor(health, 9, 40)).toBe(2);
    expect(starsFor(health, 9, 10)).toBe(1);
  });

  it('opens each challenge once the one before is cleared', () => {
    const first = CHALLENGES[0]!.id;
    expect(isUnlocked({}, 0)).toBe(true);
    expect(isUnlocked({}, 1)).toBe(false);
    expect(isUnlocked({ [first]: 1 }, 1)).toBe(true);
    expect(nextChallenge(first)?.id).toBe(CHALLENGES[1]!.id);
    expect(nextChallenge(CHALLENGES[CHALLENGES.length - 1]!.id)).toBeNull();
  });
});
