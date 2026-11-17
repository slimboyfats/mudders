import { describe, expect, it } from 'vitest';
import { FP, type World } from '@mudders/sim';
import { flatWorld, passTurns } from './testing';

describe('turns', () => {
  it('passes the turn of a tank that died before it could shoot', () => {
    const w = flatWorld(150, { players: 3, tankColumns: [40, 200, 360], turnOrder: [0, 1, 2] });
    passTurns(w, 1);
    expect(w.activePlayer).toBe(1);
    // e.g. the sudden-death edge swallowed it at the start of its turn
    w.tanks[1]!.alive = false;
    w.run(5);
    expect(w.activePlayer).toBe(2);
    expect(w.phase).toBe('aim');
  });

  /** Fire the active tank's missile and count the ticks until the turn has passed. */
  function shotTicks(w: World, eachTick: () => void, max = 3000): number {
    const p = w.activePlayer;
    w.applyInput(p, { type: 'selectWeapon', weapon: 'weapon.missile' });
    w.applyInput(p, { type: 'aim', angle: 60, power: 500 });
    w.applyInput(p, { type: 'fire' });
    w.step();
    let n = 0;
    while (n < max && (w.phase === 'resolve' || w.activePlayer === p)) {
      eachTick();
      w.step();
      n++;
    }
    return n;
  }

  it('waits at most four seconds on a world that never comes to rest (kernel 0.61.0)', () => {
    const calm = flatWorld(150, { players: 2, tankColumns: [60, 340], turnOrder: [0, 1] });
    const base = shotTicks(calm, () => {});
    expect(calm.activePlayer).toBe(1);

    // the same shot, with earth thrown up somewhere every tick for as long as anyone watches
    const w = flatWorld(150, { players: 2, tankColumns: [60, 340], turnOrder: [0, 1] });
    const dirt = w.mats.cellOf('material.dirt');
    const busy = shotTicks(w, () => {
      w.debris.spawn(200 * FP, 100 * FP, 0, -2 * FP, dirt, 0, 0);
    });
    expect(w.activePlayer).toBe(1);
    expect(w.phase).toBe('aim');
    // the shot itself, then the four seconds a restless world gets
    expect(busy).toBeGreaterThan(base);
    expect(busy).toBeLessThanOrEqual(base + 240 + 5);
  });
});
