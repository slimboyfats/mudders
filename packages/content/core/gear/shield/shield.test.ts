import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, makeWorld, passTurns } from '../../../src/testing';

describe('gear.shield', () => {
  it('switches on while aiming without using the turn, and soaks a hit before health', () => {
    const w = flatWorld(150, { tankSetup: [{ inventory: { 'gear.shield': 2 } }] });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.shield');
    expect(t.shield).toBe(0);
    w.applyInput(0, { type: 'useGear', gear: 'gear.shield' });
    w.step();
    expect([t.shield, t.gear[g], w.phase, w.activePlayer]).toEqual([50, 1, 'aim', 0]);
    expect(effectsOf(w, 'shieldUp')).toHaveLength(1);
    // a second one would change nothing, so it is refused and kept
    w.applyInput(0, { type: 'useGear', gear: 'gear.shield' });
    w.step();
    expect(t.gear[g]).toBe(1);
    dropAt(w, 'weapon.missile', t.x + 14);
    expect(t.health).toBe(100);
    expect(t.shield).toBeLessThan(50);
  });

  it('only works on your own turn', () => {
    const w = flatWorld(150, { tankSetup: [undefined, { inventory: { 'gear.shield': 1 } }] });
    w.applyInput(1, { type: 'useGear', gear: 'gear.shield' });
    w.step();
    expect(w.tanks[1]!.shield).toBe(0);
    passTurns(w, 1);
    expect(w.activePlayer).toBe(1);
    w.applyInput(1, { type: 'useGear', gear: 'gear.shield' });
    w.step();
    expect(w.tanks[1]!.shield).toBe(50);
  });

  it('is sold in the shop at a fixed price, up to its carry limit', () => {
    const w = makeWorld({ rules: { rounds: 2, startingCash: 100_000 } });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.shield');
    expect(w.buy(t, 'gear.shield', 1)).toBe(false); // not shop time
    w.phase = 'shop';
    expect(w.buy(t, 'gear.shield', 1)).toBe(true);
    expect([t.gear[g], t.money]).toEqual([1, 98_000]);
    for (let i = 0; i < 20; i++) w.buy(t, 'gear.shield', 1);
    expect(t.gear[g]).toBe(w.gear[g]!.max);
  });

  it('is gone at the next round, like any shield', () => {
    const w = flatWorld(150, {
      rules: { rounds: 2, turnTimer: 0, suddenDeath: false },
      tankSetup: [{ inventory: { 'gear.shield': 1 } }],
    });
    w.applyInput(0, { type: 'useGear', gear: 'gear.shield' });
    w.step();
    expect(w.tanks[0]!.shield).toBe(50);
    w.tanks[1]!.health = 0;
    w.tanks[1]!.alive = false;
    passTurns(w, 1);
    for (let i = 0; i < 9000 && !(w.round === 1 && w.phase === 'aim'); i++) w.step();
    expect(w.round).toBe(1);
    expect([w.tanks[0]!.shield, w.snapshot().entities[0]]).toMatchObject([0, { maxShield: 0 }]);
  });
});
