import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { loadContent } from '../../../src/index';
import { dropAt, effectsOf, flatWorld, flatten, makeWorld, passTurns } from '../../../src/testing';

/** Two tanks on a flat 400-wide map: player 0 at column 60, player 1 at column 300. */
function world() {
  return flatWorld(150, { tankColumns: [60, 300] });
}

/** Queue an input and run the tick that applies it. */
function send(w: World, player: number, input: Parameters<World['applyInput']>[1]): void {
  w.applyInput(player, input);
  w.step();
}

/** Run until the turn passes (the shot resolves) or `max` ticks. */
function settle(w: World, max = 3000): void {
  let n = 0;
  w.step();
  while (n < max && w.phase === 'resolve') {
    w.step();
    n++;
  }
}

describe('weapon.telepathy', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.telepathy')).toBe(true);
  });

  it('links enemy tanks in the rings to the caster for their next turn, and only those', () => {
    const w = world();
    dropAt(w, 'weapon.telepathy', 320);
    expect(w.tanks[1]!.mind).toBe(1);
    expect(w.tanks[1]!.mindBy).toBe(0);
    expect(w.tanks[0]!.mind).toBe(0);
    expect(effectsOf(w, 'mindLink').length).toBe(1);
    // light damage only
    expect(w.tanks[1]!.health).toBeGreaterThan(85);
  });

  it('never links the caster or its team', () => {
    const w = makeWorld({
      map: { width: 400, height: 200 },
      players: 3,
      tankColumns: [60, 300, 330],
      teams: [0, 1, 0],
      wind: 0,
      turnOrder: [0, 1, 2],
      rules: { turnTimer: 0, suddenDeath: false },
    });
    dropAt(w, 'weapon.telepathy', 315);
    expect(w.tanks[1]!.mind).toBe(1);
    expect(w.tanks[2]!.mind).toBe(0);
    const self = world();
    dropAt(self, 'weapon.telepathy', 60);
    expect(self.tanks[0]!.mind).toBe(0);
  });

  it("the caster steers the linked tank's turn with its arsenal; its owner can't", () => {
    const w = world();
    const victim = w.tanks[1]!;
    const nuke = w.weaponByIndex('weapon.missile');
    victim.inventory[nuke] = 1;
    dropAt(w, 'weapon.telepathy', 300);
    expect(w.activePlayer).toBe(1);
    expect(w.controller).toBe(0);
    expect(effectsOf(w, 'mindTurn').length).toBe(1);
    // the victim's own inputs do nothing
    send(w, 1, { type: 'aim', angle: 10, power: 100 });
    expect(victim.angle).not.toBe(10);
    // the caster aims the victim's barrel, picks the victim's missile and drives it
    send(w, 0, { type: 'selectWeapon', weapon: 'weapon.missile' });
    expect(victim.weapon).toBe(nuke);
    send(w, 0, { type: 'aim', angle: 90, power: 120 });
    expect(victim.angle).toBe(90);
    const x = victim.x;
    send(w, 0, { type: 'drive', dir: 1 });
    for (let i = 0; i < 30; i++) w.step();
    send(w, 0, { type: 'drive', dir: 0 });
    expect(victim.x).toBeGreaterThan(x);
    // the caster's tank is untouched
    expect(w.tanks[0]!.angle).not.toBe(90);
    const hp = victim.health;
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect(victim.inventory[nuke]).toBe(0);
    expect(w.projectiles[0]?.owner).toBe(0);
    settle(w);
    // its own missile, straight up: it came down on itself
    expect(victim.health).toBeLessThan(hp);
    expect(effectsOf(w, 'mindFree').length).toBe(1);
    expect(victim.mind).toBe(0);
  });

  it('wears off after one turn: the next turn is its own again', () => {
    const w = world();
    dropAt(w, 'weapon.telepathy', 300);
    send(w, 0, { type: 'aim', angle: 90, power: 0 });
    send(w, 0, { type: 'fire' });
    settle(w);
    passTurns(w, 1);
    expect(w.activePlayer).toBe(1);
    expect(w.controller).toBe(1);
    send(w, 1, { type: 'aim', angle: 33, power: 300 });
    expect(w.tanks[1]!.angle).toBe(33);
  });

  it('breaks if the caster dies before the linked turn', () => {
    const w = world();
    dropAt(w, 'weapon.telepathy', 300);
    expect(w.controller).toBe(0);
    w.tanks[0]!.alive = false;
    expect(w.controller).toBe(1);
    send(w, 1, { type: 'aim', angle: 33, power: 300 });
    expect(w.tanks[1]!.angle).toBe(33);
  });

  it('a bot caster turns the linked tank on its own side', () => {
    const w = makeWorld({
      map: { width: 800, height: 400 },
      players: 3,
      tankColumns: [100, 400, 650],
      bots: ['ai.cyborg', null, null],
      wind: 0,
      turnOrder: [0, 1, 2],
      rules: { turnTimer: 0, suddenDeath: false },
    });
    flatten(w, 300);
    const victim = w.tanks[1]!;
    victim.mind = 1;
    victim.mindBy = 0;
    // make it player 1's turn
    w.tanks[0]!.bot = -1;
    passTurns(w, 1);
    w.tanks[0]!.bot = 0;
    w.botWait = 50; // BOT_THINK_TICKS: the turn began while player 0 was human: give its bot the think time back
    expect(w.activePlayer).toBe(1);
    expect(w.controller).toBe(0);
    const before2 = w.tanks[2]!.health;
    const before0 = w.tanks[0]!.health;
    let n = 0;
    while (w.phase === 'aim' && n < 2000) {
      w.step();
      n++;
    }
    expect(w.phase).not.toBe('aim');
    // it fired at player 2 (the caster's enemy), never at the caster
    expect(w.projectiles[0]?.owner ?? 0).toBe(0);
    settle(w);
    expect(w.tanks[2]!.health).toBeLessThan(before2);
    expect(w.tanks[0]!.health).toBe(before0);
  });

  it('a linked bot is steered by its human caster and its own brain sits it out', () => {
    const w = makeWorld({
      map: { width: 400, height: 200 },
      tankColumns: [60, 300],
      bots: [null, 'ai.cyborg'],
      wind: 0,
      turnOrder: [0, 1],
      rules: { turnTimer: 0, suddenDeath: false },
    });
    dropAt(w, 'weapon.telepathy', 300);
    expect(w.activePlayer).toBe(1);
    expect(w.controller).toBe(0);
    for (let i = 0; i < 400; i++) w.step();
    // the bot never fired on its own: still waiting for the caster
    expect(w.phase).toBe('aim');
    send(w, 0, { type: 'aim', angle: 90, power: 0 });
    send(w, 0, { type: 'fire' });
    expect(w.phase).toBe('resolve');
  });
});
