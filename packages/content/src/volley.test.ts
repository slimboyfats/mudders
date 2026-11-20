import { describe, expect, it } from 'vitest';
import { BOT_THINK_TICKS, type World, type WorldOptions } from '@mudders/sim';
import { flatWorld } from './testing';

/** A flat map with volley turns on. */
function volleyWorld(opts: Partial<WorldOptions> = {}, turnTimer = 0): World {
  return flatWorld(150, {
    players: 3,
    tankColumns: [60, 200, 340],
    turnOrder: [0, 1, 2],
    ...opts,
    rules: { turnTimer, suddenDeath: false, volley: true, ...opts.rules },
  });
}

/** Aim a tank's tracer straight up (it lands back on the shooter, harmlessly). */
function aimTracer(w: World, p: number, power = 0): void {
  w.applyInput(p, { type: 'selectWeapon', weapon: 'weapon.tracer' });
  w.applyInput(p, { type: 'aim', angle: 90, power });
}

function giveTracers(w: World): void {
  const idx = w.weaponByIndex('weapon.tracer');
  for (const t of w.tanks) t.inventory[idx] = 99;
}

/** Step until the shells have resolved and the next volley is being aimed. */
function resolve(w: World, max = 3000): void {
  let n = 0;
  while (n < max && w.phase === 'resolve') {
    w.step();
    n++;
  }
}

describe('volley turns', () => {
  it('waits until every tank has locked in, then fires all shells on one tick', () => {
    const w = volleyWorld();
    giveTracers(w);
    expect(w.phase).toBe('aim');
    expect(w.activePlayer).toBe(-1);
    for (const p of [0, 1, 2]) aimTracer(w, p, 50 + p * 10);
    w.applyInput(0, { type: 'fire' });
    w.applyInput(2, { type: 'fire' });
    w.run(30);
    // two have locked in; nothing flies until the third does
    expect(w.tanks.map((t) => t.ready)).toEqual([true, false, true]);
    expect(w.projectiles.length).toBe(0);
    // a locked-in tank no longer takes aim changes
    w.applyInput(0, { type: 'aim', angle: 10, power: 900 });
    w.step();
    expect(w.tanks[0]!.angle).toBe(90);
    w.applyInput(1, { type: 'fire' });
    w.step();
    expect(w.phase).toBe('resolve');
    expect(w.projectiles.map((p) => p.owner)).toEqual([0, 1, 2]);
    expect(w.tanks.every((t) => !t.ready)).toBe(true);
    resolve(w);
    // one volley is one turn, then everyone aims again
    expect(w.phase).toBe('aim');
    expect(w.turn).toBe(1);
  });

  it('fires whoever has not locked in when the timer runs out', () => {
    const w = volleyWorld({}, 2);
    giveTracers(w);
    for (const p of [0, 1, 2]) aimTracer(w, p);
    w.applyInput(1, { type: 'fire' });
    w.run(60);
    expect(w.phase).toBe('aim');
    w.run(70);
    expect(w.phase).toBe('resolve');
    expect(w.projectiles.length).toBe(3);
  });

  it('lets bots plan and lock in alongside the humans', () => {
    const w = volleyWorld({ bots: [null, 'ai.shooter', 'ai.shooter'] });
    w.run(BOT_THINK_TICKS + 5);
    expect(w.tanks.map((t) => t.ready)).toEqual([false, true, true]);
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect(w.phase).toBe('resolve');
    expect(w.projectiles.map((p) => p.owner)).toEqual([0, 1, 2]);
  });

  it('wears own-turn counters down for every tank at the end of a volley', () => {
    const w = volleyWorld();
    giveTracers(w);
    for (const t of w.tanks) t.chill = 2;
    w.tanks[1]!.glue = 1;
    for (const p of [0, 1, 2]) {
      aimTracer(w, p);
      w.applyInput(p, { type: 'fire' });
    }
    w.step();
    resolve(w);
    expect(w.tanks.map((t) => t.chill)).toEqual([1, 1, 1]);
    expect(w.tanks[1]!.glue).toBe(0);
  });

  it('counts the turn cap in volleys', () => {
    const w = volleyWorld({ rules: { turnCap: 2, rounds: 2 } });
    giveTracers(w);
    for (let v = 0; v < 2; v++) {
      expect(w.round).toBe(0);
      for (const p of [0, 1, 2]) {
        aimTracer(w, p);
        w.applyInput(p, { type: 'fire' });
      }
      w.step();
      resolve(w);
    }
    expect(w.round).toBe(1);
  });

  it('credits each shell to its own tank when they land together', () => {
    const w = volleyWorld({ players: 2, tankColumns: [100, 300], turnOrder: [0, 1] });
    const t0 = w.tanks[0]!;
    const t1 = w.tanks[1]!;
    // each finds the shot that lands on the other, as a bot would
    const missile = w.weaponByIndex('weapon.missile');
    t0.inventory[missile] = 1;
    t1.inventory[missile] = 1;
    for (const [me, foe] of [
      [t0, t1],
      [t1, t0],
    ] as const) {
      let best = { angle: 0, power: 0, d: Infinity };
      for (let a = me === t0 ? 20 : 100; a <= (me === t0 ? 80 : 160); a += 2) {
        for (let pw = 300; pw <= 1000; pw += 20) {
          const hit = w.predict(me, missile, a, pw);
          const d = Math.abs(hit.x - foe.x);
          if (d < best.d) best = { angle: a, power: pw, d };
        }
      }
      w.applyInput(me.player, { type: 'selectWeapon', weapon: 'weapon.missile' });
      w.applyInput(me.player, { type: 'aim', angle: best.angle, power: best.power });
      w.applyInput(me.player, { type: 'fire' });
    }
    const h0 = t0.health;
    const h1 = t1.health;
    w.step();
    expect(w.projectiles.length).toBe(2);
    resolve(w);
    expect(t0.health).toBeLessThan(h0);
    expect(t1.health).toBeLessThan(h1);
    // each is credited with the hit it dealt, none as self-damage
    expect(t0.damageDealt).toBe(h1 - t1.health);
    expect(t1.damageDealt).toBe(h0 - t0.health);
    expect(t0.lastHitBy).toBe(1);
    expect(t1.lastHitBy).toBe(0);
  });

  it('plays the same volleys on every machine (bots only)', () => {
    const run = (): string[] => {
      const w = volleyWorld({ bots: ['ai.shooter', 'ai.tosser', 'ai.shooter'] });
      const out: string[] = [];
      for (let v = 0; v < 3 && w.phase !== 'over'; v++) {
        let n = 0;
        while (n++ < 400 && w.phase === 'aim') w.step();
        resolve(w);
        out.push(w.hash());
      }
      return out;
    };
    const a = run();
    expect(a.length).toBe(3);
    expect(run()).toEqual(a);
  });
});
