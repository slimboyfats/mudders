import { describe, expect, it } from 'vitest';
import { BOT_THINK_TICKS, World } from '@mudders/sim';
import { loadContent } from './index';

/** AI takeover of a dropped human (§6.1) is a sim input, so every peer applies it on one tick. */
describe('takeover input', () => {
  const content = loadContent();
  const mk = (turnTimer = 0) =>
    new World(content, {
      seed: 7,
      mode: 'mode.classic',
      players: 2,
      rules: { rounds: 2, turnTimer },
    });

  it('lets a bot fire for the active human, then hands the tank back', () => {
    const w = mk();
    expect(w.phase).toBe('aim');
    const p = w.activePlayer;
    // no turn timer: a human who never acts would stall the match forever
    w.run(BOT_THINK_TICKS * 3);
    expect(w.phase).toBe('aim');
    w.applyInput(p, { type: 'takeover', bot: 'ai.shooter' });
    w.step();
    expect(w.botId(w.tanks[p]!.bot)).toBe('ai.shooter');
    // a human input is ignored while the bot holds the tank
    w.applyInput(p, { type: 'aim', angle: 3, power: 3 });
    w.run(BOT_THINK_TICKS + 1);
    expect(w.phase).toBe('resolve');
    expect(w.tanks[p]!.angle).not.toBe(3);
    w.applyInput(p, { type: 'takeover', bot: null });
    w.step();
    expect(w.tanks[p]!.bot).toBe(-1);
  });

  it('restarts the turn timer when the human comes back mid-turn', () => {
    const w = mk(10);
    const p = w.activePlayer;
    w.applyInput(p, { type: 'takeover', bot: 'ai.moron' });
    w.run(5);
    w.applyInput(p, { type: 'takeover', bot: null });
    w.step();
    expect(w.phase).toBe('aim');
    expect(w.timer).toBe(10 * 60 - 1);
  });

  it('ignores unknown or non-AI ids and repeated takeovers', () => {
    const w = mk();
    w.applyInput(1, { type: 'takeover', bot: 'ai.nope' });
    w.applyInput(1, { type: 'takeover', bot: 'weapon.missile' });
    w.step();
    expect(w.tanks[1]!.bot).toBe(-1);
    w.applyInput(1, { type: 'takeover', bot: 'ai.shooter' });
    w.step();
    const bound = w.tanks[1]!.bot;
    w.applyInput(1, { type: 'takeover', bot: 'ai.shooter' });
    w.step();
    expect(w.tanks[1]!.bot).toBe(bound);
  });

  it('is deterministic: the same log gives the same hash', () => {
    const run = () => {
      const w = mk();
      w.run(30);
      w.applyInput(1, { type: 'takeover', bot: 'ai.poolshark' });
      w.applyInput(0, { type: 'takeover', bot: 'ai.shooter' });
      w.run(1500);
      return w.hash();
    };
    expect(run()).toBe(run());
  });
});
