import { describe, expect, it } from 'vitest';
import { AI_ACE, AI_EASY } from '@mudders/sim';
import { dropAt, flatWorld } from '../../../src/testing';

const opts = {
  mode: 'mode.coop',
  players: 3,
  teams: [0, 0, 1],
  tankColumns: [40, 120, 360],
  bots: [null, null, 'ai.shooter'],
  turnOrder: [0, 2, 1],
};

describe('mode.coop', () => {
  it('sends a weaker first wave and a stronger one each round after', () => {
    const w = flatWorld(150, { ...opts, rules: { turnTimer: 0, suddenDeath: false, rounds: 3 } });
    const bot = w.tanks[2]!;
    const human = w.tanks[0]!;
    expect(bot.maxHealth).toBe(Math.trunc((human.maxHealth * 60) / 100));
    bot.health = 5;
    dropAt(w, 'weapon.missile', bot.x);
    expect(w.results[0]!.winnerTeam).toBe(0);
    expect(w.wavesWon).toBe(1);
    // the shop: the bots got the wave's war chest
    expect(w.phase).toBe('shop');
    for (let i = 0; i < 10_000 && w.phase === 'shop'; i++) {
      for (const p of [0, 1]) w.applyInput(p, { type: 'ready' });
      w.step();
    }
    expect(bot.maxHealth).toBe(Math.trunc((human.maxHealth * 80) / 100));
  });

  it('ends the match when a wave beats the team', () => {
    const w = flatWorld(150, { ...opts, rules: { turnTimer: 0, suddenDeath: false, rounds: 5 } });
    w.tanks[0]!.health = 5;
    w.tanks[1]!.health = 5;
    dropAt(w, 'weapon.missile', 40);
    expect(w.tanks[0]!.alive).toBe(false);
    if (w.phase !== 'over') dropAt(w, 'weapon.missile', 120);
    expect(w.phase).toBe('over');
    expect(w.results).toHaveLength(1);
    expect(w.wavesWon).toBe(0);
    expect(w.matchWinnerTeam).toBe(1);
  });

  it('ramps bot skill per wave', () => {
    const w = flatWorld(150, opts);
    const m = w.mode.waves!;
    expect(m.skill[0]).toBe(AI_EASY);
    expect(m.skill[m.skill.length - 1]).toBe(AI_ACE);
  });
});
