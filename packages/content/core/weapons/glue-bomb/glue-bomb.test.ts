import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, makeWorld, passTurns } from '../../../src/testing';

/** Two tanks on a flat 400-wide map; tank 1 sits at column 300. */
function world() {
  const w = flatWorld(150, { tankColumns: [60, 300] });
  return w;
}

describe('weapon.glue-bomb', () => {
  it('glues tanks in the splat for their next turn, and only those', () => {
    const w = world();
    dropAt(w, 'weapon.glue-bomb', 330);
    expect(w.tanks[1]!.glue).toBe(1);
    expect(w.tanks[0]!.glue).toBe(0);
    expect(effectsOf(w, 'glued').length).toBe(1);
    // light damage only
    expect(w.tanks[1]!.health).toBeGreaterThan(90);
  });

  it('a glued tank cannot drive on its turn, then comes loose for the one after', () => {
    const w = world();
    dropAt(w, 'weapon.glue-bomb', 300);
    // the shot ended player 0's turn: now it is player 1's, glued
    const t = w.tanks[1]!;
    expect(w.activePlayer).toBe(1);
    expect(t.driveLeft).toBe(0);
    w.applyInput(1, { type: 'drive', dir: -1 });
    const x = t.x;
    for (let i = 0; i < 40; i++) w.step();
    expect(t.x).toBe(x);
    passTurns(w, 1);
    expect(t.glue).toBe(0);
    expect(effectsOf(w, 'unglued').length).toBe(1);
    passTurns(w, 1);
    expect(w.activePlayer).toBe(1);
    expect(t.driveLeft).toBeGreaterThan(0);
  });

  it('holds a glued tank against a shockwave shove that moves an unglued one', () => {
    const shoved = (glued: boolean) => {
      const w = world();
      if (glued) w.tanks[1]!.glue = 2;
      dropAt(w, 'weapon.shockwave', 280);
      return w.tanks[1]!.x;
    };
    expect(shoved(false)).not.toBe(300);
    expect(shoved(true)).toBe(300);
  });

  it('holds a glued tank still on an earthquake that walks terrain sideways', () => {
    const w = world();
    w.tanks[1]!.glue = 2;
    dropAt(w, 'weapon.tectonic-charge', 290);
    expect(w.tanks[1]!.x).toBe(300);
  });

  it('a glued bot stays put and still shoots', () => {
    const w = makeWorld({
      map: { width: 800, height: 400 },
      tankColumns: [150, 600],
      bots: [null, 'ai.cyborg'],
      turnOrder: [0, 1],
      wind: 0,
      rules: { turnTimer: 0, suddenDeath: false },
    });
    const bot = w.tanks[1]!;
    bot.fuel = 200;
    bot.glue = 1;
    passTurns(w, 1);
    expect(w.activePlayer).toBe(1);
    const x = bot.x;
    let n = 0;
    while (w.phase === 'aim' && n < 2000) {
      w.step();
      n++;
    }
    expect(w.phase).not.toBe('aim');
    expect(bot.x).toBe(x);
    expect(bot.fuel).toBe(200);
  });
});
