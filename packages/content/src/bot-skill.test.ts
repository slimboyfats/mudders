import { describe, expect, it } from 'vitest';
import type { World, WorldOptions } from '@mudders/sim';
import { flatten, makeWorld } from './testing';

/** Difficulty per bot seat (kernel 0.57.0): easy 0, normal 1, hard 2, ace 3. */

function duel(bot: string, skill: number | undefined, extra: Partial<WorldOptions> = {}): World {
  const w = makeWorld({
    seed: 11,
    map: { width: 800, height: 300 },
    tankColumns: [180, 560],
    turnOrder: [0, 1],
    wind: 0.006,
    bots: [bot, 'ai.moron'],
    ...(skill !== undefined ? { botSkills: [skill, 1] } : {}),
    rules: { suddenDeath: false, rounds: 3, startingCash: 20_000 },
    ...extra,
  });
  flatten(w, 200);
  for (const t of w.tanks) t.health = 100_000;
  return w;
}

/** How far player 0's first shell lands from player 1. */
function firstMiss(w: World): number {
  const t = w.tanks[0]!;
  for (let i = 0; i < 20_000 && t.lastShotX < 0; i++) w.step();
  expect(t.lastShotX).toBeGreaterThanOrEqual(0);
  return Math.abs(t.lastShotX - w.tanks[1]!.x);
}

describe('bot difficulty per seat', () => {
  it('normal is the personality as before: same shot as no skill at all', () => {
    const a = duel('ai.poolshark', undefined);
    const b = duel('ai.poolshark', 1);
    expect(firstMiss(b)).toBe(firstMiss(a));
    expect(b.tanks[0]!.lastShotPower).toBe(a.tanks[0]!.lastShotPower);
  });

  it('a hard or ace Brawler reads the wind for its opening shot; normal guesses flat ground', () => {
    const normal = firstMiss(duel('ai.shooter', 1));
    const hard = firstMiss(duel('ai.shooter', 2));
    const ace = firstMiss(duel('ai.shooter', 3));
    expect(hard).toBeLessThan(normal);
    expect(ace).toBeLessThan(normal);
    expect(ace).toBeLessThan(30);
  });

  it('an easy Trickshot misses by more than an ace one', () => {
    let easy = 0;
    let ace = 0;
    for (const seed of [3, 7, 19, 23]) {
      easy += firstMiss(duel('ai.poolshark', 0, { seed }));
      ace += firstMiss(duel('ai.poolshark', 3, { seed }));
    }
    expect(ace).toBeLessThan(easy);
  });

  it('hard and ace bots buy heavy shells for the round, and ace more gear than easy', () => {
    const stock = (skill: number) => {
      const w = duel('ai.cyborg', skill, {
        bots: ['ai.cyborg', 'ai.cyborg'],
        botSkills: [skill, 1],
      });
      const t = w.tanks[0]!;
      t.health = 0;
      t.alive = false;
      for (let i = 0; i < 40_000 && w.phase !== 'shop'; i++) w.step();
      expect(w.phase).toBe('shop');
      // shells of 40+ damage it holds (the free Missile doesn't count)
      const weapons = t.inventory.reduce(
        (n, c, i) => n + (c > 0 && (w.weapons[i]?.expectedDamage ?? 0) >= 40 ? c : 0),
        0,
      );
      const gear = t.gear.reduce((n, c) => n + c, 0);
      return { weapons, gear, money: t.money };
    };
    const easy = stock(0);
    const normal = stock(1);
    const hard = stock(2);
    const ace = stock(3);
    expect(hard.weapons).toBeGreaterThanOrEqual(4);
    expect(ace.weapons).toBeGreaterThanOrEqual(6);
    expect(ace.weapons).toBeGreaterThan(normal.weapons);
    expect(ace.weapons).toBeGreaterThan(easy.weapons);
    expect(ace.gear).toBeGreaterThan(easy.gear);
    expect(ace.money).toBeLessThan(easy.money);
  });
});
