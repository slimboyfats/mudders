import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld, makeWorld } from '../../../src/testing';
import type { World } from '@mudders/sim';

const two = { width: 600, height: 300 };

/** Run the draft to its end with every human taking the first free slot. */
function draftAll(w: World): void {
  for (let i = 0; i < 20_000 && w.phase === 'draft'; i++) {
    const p = w.drafter;
    if (p >= 0 && !w.options.bots?.[p]) {
      w.applyInput(p, { type: 'pick', slot: w.draftBy.indexOf(-1) });
    }
    w.step();
  }
}

describe('mode.points', () => {
  it('opens with a snake draft of ten picks each from one shared pool', () => {
    const w = makeWorld({ seed: 4, mode: 'mode.points', players: 2, map: two });
    expect(w.phase).toBe('draft');
    expect(w.draftPool).toHaveLength(20);
    expect(new Set(w.draftPool).size).toBe(20);
    const [a, b] = w.order as [number, number];
    expect(w.draftOrder.slice(0, 6)).toEqual([a, b, b, a, a, b]);
    // only damage dealers from the shop, and nobody holds anything yet
    for (const i of w.draftPool) {
      expect(w.weapons[i]!.price).toBeGreaterThan(0);
      expect(w.weapons[i]!.expectedDamage).toBeGreaterThan(0);
    }
    for (const t of w.tanks) expect(t.inventory.every((n) => n === 0)).toBe(true);
    // out of turn picks are ignored
    w.applyInput(b, { type: 'pick', slot: 0 });
    w.step();
    expect(w.draftBy[0]).toBe(-1);
    w.applyInput(a, { type: 'pick', slot: 3 });
    w.step();
    expect(w.draftBy[3]).toBe(a);
    expect(w.drafter).toBe(b);
    // a taken slot can't be taken again
    w.applyInput(b, { type: 'pick', slot: 3 });
    w.step();
    expect(w.draftBy[3]).toBe(a);
    draftAll(w);
    expect(w.phase).toBe('aim');
    expect(w.turnCap).toBe(10);
    for (const t of w.tanks) {
      expect(t.inventory.reduce((s, n) => s + n, 0)).toBe(10);
      expect(t.inventory[t.weapon]).toBe(1);
    }
    expect(w.draftBy.every((p) => p === 0 || p === 1)).toBe(true);
  });

  it('picks for a player whose timer runs out, and bots pick by themselves', () => {
    const w = makeWorld({
      seed: 9,
      mode: 'mode.points',
      players: 2,
      map: two,
      bots: [null, 'ai.shooter'],
      rules: { turnTimer: 0 },
    });
    for (let i = 0; i < 40_000 && w.phase === 'draft'; i++) w.step();
    expect(w.phase).toBe('aim');
    expect(w.draftBy.filter((p) => p === 0)).toHaveLength(10);
    expect(w.draftBy.filter((p) => p === 1)).toHaveLength(10);
  });

  it('brings a destroyed tank back with a penalty and never ends the round on a kill', () => {
    const w = flatWorld(150, { mode: 'mode.points', players: 2, rules: { turnTimer: 0 } });
    draftAll(w);
    const shooter = w.activePlayer;
    const victim = 1 - shooter;
    const v = w.tanks[victim]!;
    v.health = 5;
    dropAt(w, 'weapon.missile', v.x);
    expect(w.phase).toBe('aim');
    expect(v.alive).toBe(true);
    expect(v.health).toBe(v.maxHealth);
    expect(v.deaths).toBe(1);
    expect(w.tanks[shooter]!.kills).toBe(1);
  });

  it('ends after every player has fired their picks, best scorer first', () => {
    const w = flatWorld(150, { mode: 'mode.points', players: 2, rules: { turnTimer: 0 } });
    draftAll(w);
    let shots = 0;
    for (let i = 0; i < 200_000 && w.phase !== 'over'; i++) {
      if (w.phase === 'aim') {
        const p = w.activePlayer;
        const target = w.tanks[1 - p]!;
        if (p === 0) {
          // player 1 lands on the other tank; player 2 throws its shells away
          const t = w.tanks[p]!;
          w.applyInput(p, { type: 'aim', angle: target.x > t.x ? 45 : 135, power: 0 });
        } else w.applyInput(p, { type: 'aim', angle: 90, power: 50 });
        w.applyInput(p, { type: 'fire' });
        shots++;
        w.step();
        w.step();
      }
      w.step();
    }
    expect(w.phase).toBe('over');
    expect(shots).toBe(20);
    const r = w.results[0]!;
    const sc = w.mode.scoring;
    const pen = w.mode.respawn!.penalty;
    for (const t of w.tanks) {
      expect(r.points[t.player]).toBe(
        t.damageDealt * sc.damage +
          t.kills * sc.kill -
          t.selfDamage * sc.selfDamage -
          t.deaths * pen,
      );
    }
    const best = r.points[0]! === r.points[1]! ? -1 : r.points[0]! > r.points[1]! ? 0 : 1;
    expect(r.winnerTeam).toBe(best);
  });
});
